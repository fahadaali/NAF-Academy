import 'server-only'
/* توليد ملف PDF للشهادة داخل Worker بلا متصفح (النص من vector-text.ts).
   النص يُرسم مسارات متجهة من fontkit مباشرة: التشكيل العربي والوصل والحركات والكشيدة كما يرسمها الخط تماماً،
   بلا اعتماد على تضمين الخط في PDF (pdf-lib يُسقط بدائل التشكيل السياقية). والملف صغير (~10 ك.ب).
   fontkit يرتّب المقطع العربي بصرياً لكنه يقلب الأرقام واللاتينية داخله، فنقسّم السطر مقاطع ونرصّها من اليمين. */
import { PDFDocument, degrees, rgb, type PDFPage } from 'pdf-lib'
import QRCode from 'qrcode'
import { PAGE, TONES, type CertDesign } from '@/lib/certificate'
import { parse, render } from '@/motion/kashida'
import { EMBLEM } from '@/components/Emblem'
import { bidiRuns, FONTS, loadFont, shape, widthOf, type Font, type Fonts } from '../vector-text'
import { getObject } from '../storage'

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255)

type Draw = { x: number; y: number; size: number; font: Font; color: string; align?: 'center' | 'right' | 'left'; rtl?: boolean }


/** يرسم سطراً — x وy بنقاط الصفحة (y من الأعلى، على خط الأساس)، والمحاذاة حول x. يعيد العرض */
function line(page: PDFPage, text: string, o: Draw) {
  if (!text) return 0
  const k = o.size / o.font.unitsPerEm
  const rtl = o.rtl ?? /[\u0600-\u06FF]/.test(text)
  const runs = (rtl ? bidiRuns(text) : [{ text, ltr: true }]).map((r) => shape(o.font, r.text))
  const total = runs.reduce((a, r) => a + r.w, 0) * k
  const align = o.align ?? 'center'
  const y = PAGE.h - o.y
  if (!rtl) {
    const x0 = align === 'center' ? o.x - total / 2 : align === 'right' ? o.x - total : o.x
    page.drawSvgPath(runs[0].d, { x: x0, y, scale: k, color: hex(o.color) })
    return total
  }
  let right = align === 'center' ? o.x + total / 2 : align === 'right' ? o.x : o.x + total
  for (const r of runs) {
    right -= r.w * k
    if (r.d.trim()) page.drawSvgPath(r.d, { x: right, y, scale: k, color: hex(o.color) })
  }
  return total
}

/** يصغّر الخط حتى يتسع السطر */
const fit = (text: string, font: Font, size: number, max: number) => {
  let s = size
  while (s > 8 && widthOf(text, font, s) > max) s -= 1
  return s
}

function emblem(page: PDFPage, cx: number, cyTop: number, size: number, ink: string, gold: string) {
  const k = size / 100
  const X = (v: number) => cx - size / 2 + v * k
  const Y = (v: number) => PAGE.h - (cyTop + v * k)
  page.drawCircle({ x: X(EMBLEM.ring.cx), y: Y(EMBLEM.ring.cy), size: EMBLEM.ring.r * k, borderColor: hex(ink), borderWidth: 3 * k })
  for (const b of EMBLEM.bars) page.drawRectangle({ x: X(b.x), y: Y(b.y + b.h), width: b.w * k, height: b.h * k, color: hex(ink) })
  const d = EMBLEM.dot
  page.drawRectangle({ x: X(d.x), y: Y(d.y) - d.r * k * 1.4, width: d.r * 2 * k, height: d.r * 2 * k, color: hex(gold), rotate: degrees(45) })
}

async function image(doc: PDFDocument, id: string | null) {
  if (!id) return null
  const { db, schema: s } = await import('../db')
  const { eq } = await import('drizzle-orm')
  const [m] = await db.select().from(s.media).where(eq(s.media.id, id))
  if (!m) return null
  const bytes = await getObject(m.key)
  if (!bytes) return null
  if (m.mime === 'image/png') return doc.embedPng(bytes)
  if (m.mime === 'image/jpeg') return doc.embedJpg(bytes)
  return null
}

export type CertData = { name: string; course: string; hours: number; date: string; hijri: string; code: string; verifyUrl: string }

/** الهوية في الشهادة: الأسماء وبايتات الشعارين بالنسخة المناسبة لخلفية القالب */
export type CertBrand = {
  name: string; tagline: string; companyName: string; showName: boolean
  academy: Uint8Array | null; naf: Uint8Array | null
}

export async function certificatePdf(design: CertDesign, d: CertData, brand: CertBrand): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`شهادة — ${d.name} — ${d.course}`)
  doc.setAuthor(brand.name)
  doc.setSubject(d.code)
  const f: Fonts = { display: await loadFont(FONTS.display), sans: await loadFont(FONTS.sans) }
  const page = doc.addPage([PAGE.w, PAGE.h])
  const T = TONES[design.tone]
  const B = design.blocks
  const px = (p: number) => (p / 100) * PAGE.w
  const py = (p: number) => (p / 100) * PAGE.h

  page.drawRectangle({ x: 0, y: 0, width: PAGE.w, height: PAGE.h, color: hex(T.bg) })
  const bg = await image(doc, design.backgroundId)
  if (bg) page.drawImage(bg, { x: 0, y: 0, width: PAGE.w, height: PAGE.h })
  page.drawRectangle({ x: 20, y: 20, width: PAGE.w - 40, height: PAGE.h - 40, borderColor: hex(T.gold), borderWidth: 1.4 })
  page.drawRectangle({ x: 27, y: 27, width: PAGE.w - 54, height: PAGE.h - 54, borderColor: hex(T.line), borderWidth: 0.6 })

  if (B.brand.show) {
    const s = B.brand.size
    const [ac, nf] = [brand.academy ? await doc.embedPng(brand.academy).catch(() => null) : null, brand.naf ? await doc.embedPng(brand.naf).catch(() => null) : null]
    if (ac || nf) {
      /* الشعاران متجاوران بالارتفاع نفسه — الأكاديمية يميناً ثم شركة ناف، بينهما فاصل ذهبي */
      const H = s * 2.4
      const wOf = (im: typeof ac) => (im ? Math.min((im.width / im.height) * H, s * 12) : 0)
      const wa = wOf(ac), wn = wOf(nf), gap = ac && nf ? s * 1.1 : 0
      const total = wa + wn + gap * 2
      const top = py(B.brand.y) - H * (brand.showName ? 1.05 : 0.78)
      let right = px(B.brand.x) + total / 2
      if (ac) { right -= wa; page.drawImage(ac, { x: right, y: PAGE.h - top - H, width: wa, height: H }) }
      if (ac && nf) {
        right -= gap
        page.drawLine({ start: { x: right, y: PAGE.h - top - H * 0.1 }, end: { x: right, y: PAGE.h - top - H * 0.9 }, thickness: 0.6, color: hex(T.gold) })
        right -= gap
      }
      if (nf) { right -= wn; page.drawImage(nf, { x: right, y: PAGE.h - top - H, width: wn, height: H }) }
      if (brand.showName) {
        line(page, brand.name, { x: px(B.brand.x), y: top + H + s * 1.05, size: s * 0.9, font: f.display, color: T.ink })
        if (brand.tagline) line(page, brand.tagline, { x: px(B.brand.x), y: top + H + s * 1.85, size: s * 0.6, font: f.sans, color: T.gold })
      }
    } else {
      emblem(page, px(B.brand.x), py(B.brand.y) - s * 2.4, s * 2.2, T.ink, T.gold)
      line(page, brand.name, { x: px(B.brand.x), y: py(B.brand.y) + s * 0.4, size: s, font: f.display, color: T.ink })
      if (brand.tagline) line(page, brand.tagline, { x: px(B.brand.x), y: py(B.brand.y) + s * 1.3, size: s * 0.62, font: f.sans, color: T.gold })
    }
  }
  if (B.title.show) {
    const t = render(parse(design.title), 1)
    line(page, t, { x: px(B.title.x), y: py(B.title.y), size: fit(t, f.display, B.title.size, PAGE.w - 120), font: f.display, color: T.ink })
    if (design.english) line(page, 'CERTIFICATE  OF  COMPLETION', { x: px(B.title.x), y: py(B.title.y) + B.title.size * 0.55, size: B.title.size * 0.22, font: f.sans, color: T.gold, rtl: false })
  }
  if (B.lead.show) line(page, design.lead, { x: px(B.lead.x), y: py(B.lead.y), size: B.lead.size, font: f.sans, color: T.soft })
  if (B.name.show) {
    const size = fit(d.name, f.display, B.name.size, PAGE.w - 160)
    const w = line(page, d.name, { x: px(B.name.x), y: py(B.name.y), size, font: f.display, color: T.ink })
    const y = PAGE.h - py(B.name.y) - size * 0.38
    page.drawLine({ start: { x: px(B.name.x) - w / 2 - 20, y }, end: { x: px(B.name.x) + w / 2 + 20, y }, thickness: 0.8, color: hex(T.gold) })
  }
  if (B.course.show) {
    line(page, design.courseLead, { x: px(B.course.x), y: py(B.course.y) - B.course.size * 1.25, size: B.course.size * 0.72, font: f.sans, color: T.soft })
    line(page, d.course, { x: px(B.course.x), y: py(B.course.y), size: fit(d.course, f.display, B.course.size, PAGE.w - 160), font: f.display, color: T.ink })
  }
  if (B.hours.show && d.hours > 0) line(page, design.hoursText.replace(/\{\{\s*hours\s*\}\}/g, String(d.hours)), { x: px(B.hours.x), y: py(B.hours.y), size: B.hours.size, font: f.sans, color: T.soft })
  if (B.date.show) {
    line(page, `صدرت في ${d.date}`, { x: px(B.date.x), y: py(B.date.y), size: B.date.size, font: f.sans, color: T.ink })
    line(page, `الموافق ${d.hijri}`, { x: px(B.date.x), y: py(B.date.y) + B.date.size * 1.5, size: B.date.size * 0.9, font: f.sans, color: T.soft })
  }
  if (B.signatures.show && design.signatories.length) {
    const n = design.signatories.length
    const gap = 190
    const s = B.signatures.size
    for (const [i, sg] of design.signatories.entries()) {
      const cx = px(B.signatures.x) + ((n - 1) / 2 - i) * gap
      const ly = py(B.signatures.y)
      const img = await image(doc, sg.signatureId)
      if (img) {
        const h = 38, w = (img.width / img.height) * h
        page.drawImage(img, { x: cx - w / 2, y: PAGE.h - ly + 3, width: w, height: h })
      }
      page.drawLine({ start: { x: cx - 70, y: PAGE.h - ly }, end: { x: cx + 70, y: PAGE.h - ly }, thickness: 0.6, color: hex(T.line) })
      line(page, sg.name, { x: cx, y: ly + s * 1.4, size: s, font: f.display, color: T.ink })
      line(page, sg.title, { x: cx, y: ly + s * 2.7, size: s * 0.85, font: f.sans, color: T.soft })
    }
  }
  if (B.qr.show) {
    const qr = QRCode.create(d.verifyUrl, { errorCorrectionLevel: 'M' })
    const n = qr.modules.size
    const size = B.qr.size
    const cell = size / n
    const x0 = px(B.qr.x) - size / 2
    const yTop = py(B.qr.y) - size / 2
    /* لوح فاتح دائماً: القارئات لا تقرأ الرمز المعكوس على الخلفية الداكنة */
    const light = TONES.ivory.bg, dark = TONES.ivory.ink
    page.drawRectangle({ x: x0 - 5, y: PAGE.h - (yTop + size + 5), width: size + 10, height: size + 10, color: hex(light) })
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (qr.modules.get(r, c)) page.drawRectangle({ x: x0 + c * cell, y: PAGE.h - (yTop + (r + 1) * cell), width: cell + 0.05, height: cell + 0.05, color: hex(dark) })
    }
    line(page, d.code, { x: px(B.qr.x), y: yTop + size + 16, size: 8.5, font: f.sans, color: T.ink, rtl: false })
    line(page, 'امسح للتحقق', { x: px(B.qr.x), y: yTop + size + 27, size: 7.5, font: f.sans, color: T.soft })
  }
  return doc.save()
}

export { bidiRuns }
