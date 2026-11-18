import 'server-only'
/* توليد ملف PDF للشهادة داخل Worker بلا متصفح (النص من vector-text.ts).
   النص يُرسم مسارات متجهة من fontkit مباشرة: التشكيل العربي والوصل والحركات والكشيدة كما يرسمها الخط تماماً،
   بلا اعتماد على تضمين الخط في PDF (pdf-lib يُسقط بدائل التشكيل السياقية). والملف صغير (~10 ك.ب).
   fontkit يرتّب المقطع العربي بصرياً لكنه يقلب الأرقام واللاتينية داخله، فنقسّم السطر مقاطع ونرصّها من اليمين. */
import { PDFDocument, LineCapStyle, rgb, type PDFPage } from 'pdf-lib'
import QRCode from 'qrcode'
import { hoursOf, mergeDesign, PAGE, signerEn, SPLIT, TONES, type CertDesign } from '@/lib/certificate'
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

/** رمز الكتاب بالهندسة نفسها لمكوّن Emblem — cyTop أعلى مربّع الشبكة 100×100 */
function emblem(page: PDFPage, cx: number, cyTop: number, size: number, ink: string, gold: string) {
  const k = size / 100
  const at = { x: cx - size / 2, y: PAGE.h - cyTop, scale: k }
  for (const d of EMBLEM.pages) page.drawSvgPath(d, { ...at, color: hex(ink) })
  for (const d of EMBLEM.lines) page.drawSvgPath(d, { ...at, borderColor: hex(ink), borderWidth: EMBLEM.lineWidth, borderLineCap: LineCapStyle.Round })
  page.drawSvgPath(EMBLEM.diamond, { ...at, color: hex(gold) })
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

export type CertData = { name: string; course: string; hours: number; date: string; hijri: string; code: string; verifyUrl: string; nameEn?: string; courseEn?: string; dateEn?: string; idNumber?: string }

/** الهوية في الشهادة: الأسماء وبايتات شعار الأكاديمية (PNG) بالنسخة المناسبة لخلفية القالب. full: الشعار الكامل */
export type CertBrand = {
  name: string; tagline: string; companyName: string; showName: boolean
  logo: { bytes: Uint8Array; w: number; h: number } | null; full: boolean
}

export async function certificatePdf(input: CertDesign, d: CertData, brand: CertBrand): Promise<Uint8Array> {
  /* اللقطات القديمة بلا العناصر الأحدث (رقم الهوية، التخطيط) — الدمج يكمّلها بمواضعها الافتراضية ولا يغيّر شكلها */
  const design = mergeDesign(input)
  const doc = await PDFDocument.create()
  doc.setTitle(`شهادة — ${d.name} — ${d.course}`)
  doc.setAuthor(brand.name)
  doc.setSubject(d.code)
  const f: Fonts = { display: await loadFont(FONTS.display), sans: await loadFont(FONTS.sans) }
  const page = doc.addPage([PAGE.w, PAGE.h])
  const T = TONES[design.tone]
  const B = design.blocks
  /* الوجه الإنجليزي (الشهادة الثنائية) */
  const bi = !!design.bilingual
  const en = design.en
  const split = design.layout === 'split'
  const px = (p: number) => (p / 100) * PAGE.w
  const py = (p: number) => (p / 100) * PAGE.h

  page.drawRectangle({ x: 0, y: 0, width: PAGE.w, height: PAGE.h, color: hex(T.bg) })
  const bg = await image(doc, design.backgroundId)
  if (bg) page.drawImage(bg, { x: 0, y: 0, width: PAGE.w, height: PAGE.h })
  page.drawRectangle({ x: 20, y: 20, width: PAGE.w - 40, height: PAGE.h - 40, borderColor: hex(T.gold), borderWidth: 1.4 })
  page.drawRectangle({ x: 27, y: 27, width: PAGE.w - 54, height: PAGE.h - 54, borderColor: hex(T.line), borderWidth: 0.6 })

  if (B.brand.show) {
    const s = B.brand.size
    const lg = brand.logo ? await doc.embedPng(brand.logo.bytes).catch(() => null) : null
    if (lg) {
      /* شعار الأكاديمية وحده في الأعلى — الكامل أطول من صيغة الشريط */
      const H = s * (brand.full ? 3.6 : 2.4)
      const w = Math.min((lg.width / lg.height) * H, s * (brand.full ? 16 : 12))
      const top = py(B.brand.y) - H * (brand.showName ? 1.05 : 0.78)
      page.drawImage(lg, { x: px(B.brand.x) - w / 2, y: PAGE.h - top - H, width: w, height: H })
      if (brand.showName) {
        line(page, brand.name, { x: px(B.brand.x), y: top + H + s * 1.05, size: s * 0.9, font: f.display, color: T.ink })
        if (brand.tagline) line(page, brand.tagline, { x: px(B.brand.x), y: top + H + s * 1.85, size: s * 0.6, font: f.sans, color: T.gold })
      }
    } else {
      emblem(page, px(B.brand.x), py(B.brand.y) - s * 2.6, s * 2.6, T.ink, T.gold)
      line(page, brand.name, { x: px(B.brand.x), y: py(B.brand.y) + s * 0.4, size: s, font: f.display, color: T.ink })
      if (brand.tagline) line(page, brand.tagline, { x: px(B.brand.x), y: py(B.brand.y) + s * 1.3, size: s * 0.62, font: f.sans, color: T.gold })
    }
  }
  if (split) {
    /* عمودان متقابلان: العربي يميناً والإنجليزي يساراً على الارتفاع نفسه — والفاصل بينهما خط ذهبي بمعيّن في وسطه */
    const AR = px(SPLIT.ar), EN = px(SPLIT.en), W = px(SPLIT.width)
    const mid = PAGE.w / 2, y1 = PAGE.h - py(SPLIT.divider.from), y2 = PAGE.h - py(SPLIT.divider.to), ym = (y1 + y2) / 2
    page.drawLine({ start: { x: mid, y: y1 }, end: { x: mid, y: ym + 7 }, thickness: 0.6, color: hex(T.line) })
    page.drawLine({ start: { x: mid, y: ym - 7 }, end: { x: mid, y: y2 }, thickness: 0.6, color: hex(T.line) })
    page.drawSvgPath('M0 -4.5 L4.5 0 L0 4.5 L-4.5 0 Z', { x: mid, y: ym, color: hex(T.gold) })
    const pair = (ar: string, enText: string, y: number, size: number, font: Font, color: string, enScale = 0.82, enFont: Font = f.sans) => {
      if (ar) line(page, ar, { x: AR, y, size: fit(ar, font, size, W), font, color })
      if (enText) line(page, enText, { x: EN, y, size: fit(enText, enFont, size * enScale, W), font: enFont, color, rtl: false })
    }
    if (B.title.show) pair(render(parse(design.title), 1), en.title, py(B.title.y), B.title.size, f.display, T.ink, 0.72, f.display)
    if (B.lead.show) pair(design.lead, en.lead, py(B.lead.y), B.lead.size, f.sans, T.soft, 0.92)
    if (B.name.show) {
      /* بلا اسم إنجليزي في ملف المتدرب يُكتب الاسم العربي في العمودين — لا عمود فارغ */
      pair(d.name, d.nameEn || d.name, py(B.name.y), B.name.size, f.display, T.ink, d.nameEn ? 0.8 : 1, f.display)
      const uy = PAGE.h - py(B.name.y) - B.name.size * 0.42
      for (const cx of [AR, EN]) page.drawLine({ start: { x: cx - W / 2.6, y: uy }, end: { x: cx + W / 2.6, y: uy }, thickness: 0.7, color: hex(T.gold) })
    }
    if (B.idNumber.show && d.idNumber) pair(`${design.idLabel} ${d.idNumber}`, `${en.idLabel} ${d.idNumber}`, py(B.idNumber.y), B.idNumber.size, f.sans, T.ink, 1)
    if (B.course.show) {
      pair(design.courseLead, en.courseLead, py(B.course.y) - B.course.size * 1.35, B.course.size * 0.72, f.sans, T.soft, 1)
      pair(d.course, d.courseEn || d.course, py(B.course.y), B.course.size, f.display, T.ink, d.courseEn ? 0.85 : 1, f.display)
    }
    if (B.hours.show && d.hours > 0) pair(hoursOf(design.hoursText, d.hours), hoursOf(en.hoursText, d.hours), py(B.hours.y), B.hours.size, f.sans, T.soft, 1)
    if (B.date.show) {
      pair(`صدرت في ${d.date}`, d.dateEn ? `${en.issued} ${d.dateEn}` : '', py(B.date.y), B.date.size, f.sans, T.ink, 1)
      if (d.hijri) line(page, `الموافق ${d.hijri}`, { x: AR, y: py(B.date.y) + B.date.size * 1.5, size: B.date.size * 0.9, font: f.sans, color: T.soft })
    }
  } else {
    if (B.title.show) {
      const t = render(parse(design.title), 1)
      line(page, t, { x: px(B.title.x), y: py(B.title.y), size: fit(t, f.display, B.title.size, PAGE.w - 120), font: f.display, color: T.ink })
      if (bi && en.title) line(page, en.title.toUpperCase().replace(/ /g, '  '), { x: px(B.title.x), y: py(B.title.y) + B.title.size * 0.58, size: B.title.size * 0.26, font: f.sans, color: T.gold, rtl: false })
      else if (design.english) line(page, 'CERTIFICATE  OF  COMPLETION', { x: px(B.title.x), y: py(B.title.y) + B.title.size * 0.55, size: B.title.size * 0.22, font: f.sans, color: T.gold, rtl: false })
    }
    if (B.lead.show) {
      line(page, design.lead, { x: px(B.lead.x), y: py(B.lead.y), size: B.lead.size, font: f.sans, color: T.soft })
      if (bi && en.lead) line(page, en.lead, { x: px(B.lead.x), y: py(B.lead.y) + B.lead.size * 1.15, size: B.lead.size * 0.78, font: f.sans, color: T.soft, rtl: false })
    }
    if (B.name.show) {
      const size = fit(d.name, f.display, B.name.size, PAGE.w - 160)
      const w = line(page, d.name, { x: px(B.name.x), y: py(B.name.y), size, font: f.display, color: T.ink })
      const y = PAGE.h - py(B.name.y) - size * 0.38
      page.drawLine({ start: { x: px(B.name.x) - w / 2 - 20, y }, end: { x: px(B.name.x) + w / 2 + 20, y }, thickness: 0.8, color: hex(T.gold) })
      if (bi && d.nameEn) line(page, d.nameEn, { x: px(B.name.x), y: py(B.name.y) + size * 0.85, size: fit(d.nameEn, f.sans, size * 0.42, PAGE.w - 160), font: f.sans, color: T.ink, rtl: false })
    }
    if (B.idNumber.show && d.idNumber) {
      line(page, `${design.idLabel} ${d.idNumber}`, { x: px(B.idNumber.x), y: py(B.idNumber.y), size: B.idNumber.size, font: f.sans, color: T.ink })
      if (bi && en.idLabel) line(page, `${en.idLabel} ${d.idNumber}`, { x: px(B.idNumber.x), y: py(B.idNumber.y) + B.idNumber.size * 1.3, size: B.idNumber.size * 0.85, font: f.sans, color: T.soft, rtl: false })
    }
    if (B.course.show) {
      line(page, design.courseLead, { x: px(B.course.x), y: py(B.course.y) - B.course.size * 1.25, size: B.course.size * 0.72, font: f.sans, color: T.soft })
      line(page, d.course, { x: px(B.course.x), y: py(B.course.y), size: fit(d.course, f.display, B.course.size, PAGE.w - 160), font: f.display, color: T.ink })
      if (bi && (d.courseEn || en.courseLead)) {
        const t = [en.courseLead, d.courseEn].filter(Boolean).join(' ')
        line(page, t, { x: px(B.course.x), y: py(B.course.y) + B.course.size * 1.05, size: fit(t, f.sans, B.course.size * 0.55, PAGE.w - 160), font: f.sans, color: T.soft, rtl: false })
      }
    }
    if (B.hours.show && d.hours > 0) {
      line(page, hoursOf(design.hoursText, d.hours), { x: px(B.hours.x), y: py(B.hours.y), size: B.hours.size, font: f.sans, color: T.soft })
      if (bi && en.hoursText) line(page, hoursOf(en.hoursText, d.hours), { x: px(B.hours.x), y: py(B.hours.y) + B.hours.size * 1.3, size: B.hours.size * 0.85, font: f.sans, color: T.soft, rtl: false })
    }
    if (B.date.show) {
      line(page, `صدرت في ${d.date}`, { x: px(B.date.x), y: py(B.date.y), size: B.date.size, font: f.sans, color: T.ink })
      if (d.hijri) line(page, `الموافق ${d.hijri}`, { x: px(B.date.x), y: py(B.date.y) + B.date.size * 1.5, size: B.date.size * 0.9, font: f.sans, color: T.soft })
      if (bi && d.dateEn) line(page, `${en.issued} ${d.dateEn}`, { x: px(B.date.x), y: py(B.date.y) + B.date.size * 3, size: B.date.size * 0.9, font: f.sans, color: T.soft, rtl: false })
    }
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
      if (bi && signerEn(sg)) line(page, signerEn(sg), { x: cx, y: ly + s * 3.9, size: s * 0.8, font: f.sans, color: T.soft, rtl: false })
    }
  }
  if (B.stamp.show && design.stampId) {
    const img = await image(doc, design.stampId)
    if (img) {
      const h = B.stamp.size, w = (img.width / img.height) * h
      page.drawImage(img, { x: px(B.stamp.x) - w / 2, y: PAGE.h - py(B.stamp.y) - h / 2, width: w, height: h })
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
