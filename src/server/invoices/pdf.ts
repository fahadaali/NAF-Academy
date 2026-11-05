import 'server-only'
/* الفاتورة الضريبية المبسّطة (والإشعار الدائن) ملف PDF A4 — النص مسارات متجهة من خط ثمانية كالشهادة،
   ورمز ZATCA مربّعات متجهة، وشعار الأكاديمية PNG. المحتوى من الفاتورة المخزّنة نفسها (لا يُعاد الحساب). */
import { PDFDocument, rgb, type PDFPage } from 'pdf-lib'
import QRCode from 'qrcode'
import { bidiRuns, FONTS, loadFont, shape, widthOf, type Font } from '../vector-text'
import { brandView, logoBytes } from '../brand'
import { pick } from '@/lib/brand'
import { formatAmount } from '@/lib/pricing'
import type { schema } from '../db'

type Invoice = typeof schema.invoices.$inferSelect

/* ألوان الوثيقة: مرآة لرموز الهوية (PDF لا يقرأ متغيرات CSS) */
const C = { ink: '#14202b', soft: '#36424e', muted: '#5b6470', line: '#e3dccb', gold: '#a5813f', plate: '#f6f2e8' }
const W = 595, H = 842, M = 48
const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255)

type Draw = { x: number; y: number; size: number; font: Font; color?: string; align?: 'right' | 'left' | 'center' }

/** سطر عند x (المحاذاة حوله) وy من أعلى الصفحة على خط الأساس — يعيد عرضه */
function text(page: PDFPage, s: string, o: Draw) {
  if (!s) return 0
  const k = o.size / o.font.unitsPerEm
  const rtl = /[؀-ۿ]/.test(s)
  const runs = (rtl ? bidiRuns(s) : [{ text: s, ltr: true }]).map((r) => shape(o.font, r.text))
  const total = runs.reduce((a, r) => a + r.w, 0) * k
  const align = o.align ?? 'right'
  const y = H - o.y
  const color = hex(o.color ?? C.ink)
  if (!rtl) {
    const x0 = align === 'center' ? o.x - total / 2 : align === 'right' ? o.x - total : o.x
    page.drawSvgPath(runs[0].d, { x: x0, y, scale: k, color })
    return total
  }
  let right = align === 'center' ? o.x + total / 2 : align === 'right' ? o.x : o.x + total
  for (const r of runs) { right -= r.w * k; if (r.d.trim()) page.drawSvgPath(r.d, { x: right, y, scale: k, color }) }
  return total
}

const rule = (page: PDFPage, y: number, x0 = M, x1 = W - M, color = C.line) => page.drawLine({ start: { x: x0, y: H - y }, end: { x: x1, y: H - y }, thickness: 0.7, color: hex(color) })
const dt = (iso: string) => new Date(iso).toLocaleString('ar-SA-u-nu-latn', { timeZone: 'Asia/Riyadh', dateStyle: 'long', timeStyle: 'short' })

export async function invoicePdf(inv: Invoice, o: { orderNumber: string; vatRate: number }): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const credit = inv.kind === 'credit_note'
  doc.setTitle(`${credit ? 'إشعار دائن' : 'فاتورة ضريبية'} ${inv.number}`)
  const brand = await brandView()
  doc.setAuthor(brand.name)
  const [d, sa] = [await loadFont(FONTS.display), await loadFont(FONTS.sans)]
  const page = doc.addPage([W, H])
  const R = W - M

  /* الرأس: الشعار يميناً، ونوع المستند يساراً */
  let y = M
  const logo = await logoBytes(pick(brand.academy, 'light'))
  const img = logo ? await doc.embedPng(logo.bytes).catch(() => null) : null
  if (img) {
    const h = 40, w = Math.min(200, (img.width / img.height) * h)
    page.drawImage(img, { x: R - w, y: H - (y + h), width: w, height: h })
    if (brand.showName) text(page, brand.name, { x: R - w - 12, y: y + 26, size: 15, font: d })
  } else text(page, brand.name, { x: R, y: y + 26, size: 18, font: d })
  text(page, credit ? 'إشعار دائن' : 'فاتورة ضريبية مبسّطة', { x: M, y: y + 18, size: 17, font: d, align: 'left' })
  text(page, credit ? 'Credit Note' : 'Simplified Tax Invoice', { x: M, y: y + 36, size: 10, font: sa, color: C.gold, align: 'left' })
  y += 62
  page.drawRectangle({ x: M, y: H - y - 2, width: W - 2 * M, height: 2, color: hex(C.gold) })
  y += 24

  /* بيانات المستند */
  const meta: [string, string][] = [['رقم المستند', inv.number], ['التاريخ', dt(inv.issuedAt)], ['رقم الطلب', o.orderNumber], ...(inv.refOf ? [['مرجع الفاتورة', inv.refOf] as [string, string]] : [])]
  const col = (W - 2 * M) / meta.length
  meta.forEach(([k, v], i) => {
    const x = R - i * col
    text(page, k, { x, y, size: 9, font: sa, color: C.muted })
    text(page, v, { x, y: y + 16, size: 11, font: sa })
  })
  y += 40

  /* البائع والمشتري */
  const half = (W - 2 * M) / 2
  const party = (x: number, title: string, rows: string[]) => {
    text(page, title, { x, y, size: 11, font: d, color: C.gold })
    rows.filter(Boolean).forEach((r, i) => text(page, r, { x, y: y + 18 + i * 15, size: 10, font: sa, color: i ? C.soft : C.ink }))
  }
  party(R, 'البائع', [inv.seller.name, `الرقم الضريبي: ${inv.seller.vatNumber || '—'}`, inv.seller.crNumber ? `السجل التجاري: ${inv.seller.crNumber}` : '', inv.seller.address])
  party(R - half, 'المشتري', [inv.buyer.org || inv.buyer.name, inv.buyer.org ? inv.buyer.name : '', inv.buyer.email, inv.buyer.vatNumber ? `الرقم الضريبي: ${inv.buyer.vatNumber}` : ''])
  y += 90

  /* البنود: البيان | الكمية | السعر | الإجمالي */
  const cols = { title: R, qty: M + 200, unit: M + 120, total: M }
  page.drawRectangle({ x: M, y: H - y - 8, width: W - 2 * M, height: 24, color: hex(C.plate) })
  text(page, 'البيان', { x: cols.title - 8, y: y + 8, size: 9.5, font: sa, color: C.muted })
  text(page, 'الكمية', { x: cols.qty, y: y + 8, size: 9.5, font: sa, color: C.muted, align: 'center' })
  text(page, 'السعر', { x: cols.unit, y: y + 8, size: 9.5, font: sa, color: C.muted, align: 'center' })
  text(page, 'الإجمالي', { x: cols.total + 8, y: y + 8, size: 9.5, font: sa, color: C.muted, align: 'left' })
  y += 34
  for (const l of inv.lines) {
    let title = l.title.replace(/~\d?/g, '')
    while (title.length > 8 && widthOf(title, sa, 10.5) > W - 2 * M - 230) title = `${title.slice(0, -2)}…`
    text(page, title, { x: cols.title - 8, y, size: 10.5, font: sa })
    text(page, String(l.quantity), { x: cols.qty, y, size: 10.5, font: sa, align: 'center' })
    text(page, formatAmount(l.unit), { x: cols.unit, y, size: 10.5, font: sa, align: 'center' })
    text(page, formatAmount(l.total), { x: cols.total + 8, y, size: 10.5, font: sa, align: 'left' })
    y += 10
    rule(page, y)
    y += 18
  }

  /* المجاميع يميناً، ورمز ZATCA يساراً */
  y += 8
  const exVat = inv.total - inv.vat
  const totals: [string, string, boolean][] = [
    ['الإجمالي غير شامل الضريبة', `${formatAmount(exVat)} ر.س`, false],
    [`ضريبة القيمة المضافة ${o.vatRate}%`, `${formatAmount(inv.vat)} ر.س`, false],
    [credit ? 'المبلغ المسترد' : 'الإجمالي شامل الضريبة', `${formatAmount(inv.total)} ر.س`, true],
  ]
  const top = y
  totals.forEach(([k, v, bold], i) => {
    const yy = top + i * 22
    text(page, k, { x: R, y: yy, size: bold ? 11.5 : 10, font: bold ? d : sa, color: bold ? C.ink : C.soft })
    text(page, v, { x: R - 250, y: yy, size: bold ? 12 : 10.5, font: bold ? d : sa, align: 'left' })
  })
  const qr = QRCode.create(Buffer.from(inv.qr, 'base64').length ? inv.qr : '-', { errorCorrectionLevel: 'M' })
  const n = qr.modules.size, size = 96, cell = size / n
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (qr.modules.get(r, c)) page.drawRectangle({ x: M + c * cell, y: H - (top - 8 + (r + 1) * cell), width: cell + 0.05, height: cell + 0.05, color: hex(C.ink) })
  }
  y = Math.max(top + 3 * 22, top + size) + 24
  rule(page, y)
  text(page, 'صدر هذا المستند إلكترونياً ولا يحتاج إلى توقيع.', { x: R, y: y + 18, size: 9, font: sa, color: C.muted })
  return doc.save()
}
