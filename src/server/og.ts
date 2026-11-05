import 'server-only'
/* صورة المشاركة (Open Graph) 1200×630 — النص مسارات متجهة من خط ثمانية، فالعربية سليمة الوصل في كل منصة.
   الألوان مرآة لرموز الهوية (الصورة لا تقرأ متغيرات CSS). */
import { EMBLEM } from '@/components/Emblem'
import { FONTS, loadFont, rtlPieces, wrap, type Font } from './vector-text'

const W = 1200, H = 630
const C = { bg: '#0b1520', ink: '#f3ecdc', soft: '#b9b2a2', gold: '#c9a25a', gold2: '#e0bc6e', line: '#233142' }

function text(font: Font, s: string, right: number, baseline: number, size: number, fill: string) {
  const k = size / font.unitsPerEm
  const { total, pieces } = rtlPieces(font, s)
  const x0 = right - total * k
  return pieces.map((p) => p.d.trim() ? `<path fill="${fill}" transform="translate(${(x0 + p.x * k).toFixed(2)} ${baseline}) scale(${k.toFixed(5)})" d="${p.d}"/>` : '').join('')
}

function emblem(x: number, y: number, size: number, color: string, dot: string, opacity = 1) {
  const k = size / 100
  const { pages, lines, lineWidth, diamond } = EMBLEM
  return `<g transform="translate(${x} ${y}) scale(${k})" opacity="${opacity}">${pages.map((d) => `<path d="${d}" fill="${color}"/>`).join('')}${lines.map((d) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${lineWidth}" stroke-linecap="round"/>`).join('')}<path d="${diamond}" fill="${dot}"/></g>`
}

/** الهوية في صورة المشاركة — بايتات النسخة الداكنة من شعار الأكاديمية (الشعار الكامل إن رُفع) لأن الخلفية كحلية */
export type OgBrand = { name: string; showName: boolean; logo: { bytes: Uint8Array; w: number; h: number } | null; /** الشعار الكامل (لا صيغة الشريط) */ full: boolean }

const pngHref = (b: Uint8Array) => `data:image/png;base64,${Buffer.from(b).toString('base64')}`

/** الهوية أعلى اليمين: الشعار (واسمه إن طُلب)، أو الرمز والاسم إن لم يُرفع شعار */
function brandRow(b: OgBrand, display: Font, R: number): { svg: string; bottom: number } {
  if (!b.logo) return { svg: `${emblem(R - 75, 70, 75, C.gold, C.gold2)}${text(display, b.name, R - 96, 112, 30, C.ink)}`, bottom: 132 }
  /* الحد الأدنى للشعار الكامل 120px (حزمة الهوية)، والشريط أصغر */
  const H = b.full ? 120 : 84
  const w = Math.min(b.full ? 460 : 380, (b.logo.w / b.logo.h) * H)
  let svg = `<image href="${pngHref(b.logo.bytes)}" x="${R - w}" y="62" width="${w}" height="${H}" preserveAspectRatio="xMidYMid meet"/>`
  if (b.showName) svg += text(display, b.name, R - w - 18, 62 + H * 0.62, 28, C.ink)
  return { svg, bottom: 62 + H }
}

/** غلاف الدورة في صورة المشاركة — JPEG أو PNG، ونقطة التركيز تختار جهة القص */
export type OgCover = { bytes: Uint8Array; mime: 'image/jpeg' | 'image/png'; focalX: number; focalY: number }

export async function ogSvg(o: { kicker?: string; title: string; meta?: string; brand: OgBrand; cover?: OgCover | null }) {
  if (o.kicker?.trim() === o.brand.name) o = { ...o, kicker: undefined }
  const [display, sans] = [await loadFont(FONTS.display), await loadFont(FONTS.sans)]
  const R = W - 90
  /* بغلاف: النص في الجهة اليمنى والغلاف في اليسرى */
  const maxW = o.cover ? 560 : 900
  let size = o.cover ? 64 : 76
  let lines = wrap(o.title, display, size, maxW, 3)
  if (lines.length === 3) { size = o.cover ? 54 : 64; lines = wrap(o.title, display, size, maxW + 20, 3) }
  const CX = 52, CY = 52, CW = 440, CH = H - 104
  const align = (v: number) => (v < 34 ? 'Min' : v > 66 ? 'Max' : 'Mid')
  const cover = o.cover
    ? `<defs><clipPath id="cv"><rect x="${CX}" y="${CY}" width="${CW}" height="${CH}" rx="18"/></clipPath></defs>
<image href="data:${o.cover.mime};base64,${Buffer.from(o.cover.bytes).toString('base64')}" x="${CX}" y="${CY}" width="${CW}" height="${CH}" preserveAspectRatio="x${align(o.cover.focalX)}Y${align(o.cover.focalY)} slice" clip-path="url(#cv)"/>`
    : ''
  const lh = size * 1.32
  /* السطر الأول يبدأ تحت التمهيد مهما طال العنوان */
  const head = brandRow(o.brand, display, R)
  const first = head.bottom + (o.kicker ? 100 : 82) + size * 0.82
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${C.bg}"/>
<rect x="28" y="28" width="${W - 56}" height="${H - 56}" fill="none" stroke="${C.gold}" stroke-width="2"/>
<rect x="38" y="38" width="${W - 76}" height="${H - 76}" fill="none" stroke="${C.line}" stroke-width="1"/>
${cover || (o.brand.logo ? '' : emblem(70, H - 300, 300, C.gold, C.gold2, 0.13))}
${head.svg}
${o.kicker ? text(sans, o.kicker, R, head.bottom + 54, 28, C.gold) : ''}
${lines.map((l, i) => text(display, l, R, first + i * lh, size, C.ink)).join('\n')}
${o.meta ? text(sans, o.meta, R, H - 92, 28, C.soft) : ''}
<rect x="${R - 120}" y="${H - 70}" width="120" height="4" rx="2" fill="${C.gold}"/>
</svg>`
}
