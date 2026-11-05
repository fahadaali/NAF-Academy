import 'server-only'
/* صورة المشاركة (Open Graph) 1200×630 — النص مسارات متجهة من خط ثمانية، فالعربية سليمة الوصل في كل منصة.
   الألوان مرآة لرموز الهوية (الصورة لا تقرأ متغيرات CSS). */
import { EMBLEM } from '@/components/Emblem'
import { FONTS, loadFont, rtlPieces, widthOf, wrap, type Font } from './vector-text'

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
  const { ring, bars, dot: d } = EMBLEM
  return `<g transform="translate(${x} ${y}) scale(${k})" opacity="${opacity}"><circle cx="${ring.cx}" cy="${ring.cy}" r="${ring.r}" fill="none" stroke="${color}" stroke-width="3"/>${bars.map((b) => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="1.6" fill="${color}"/>`).join('')}<rect x="${d.x - d.r}" y="${d.y - d.r}" width="${d.r * 2}" height="${d.r * 2}" rx="1" transform="rotate(45 ${d.x} ${d.y})" fill="${dot}"/></g>`
}

/** الهوية في صورة المشاركة — بايتات النسخة الداكنة من الشعارين (الخلفية كحلية) */
export type OgBrand = { name: string; showName: boolean; academy: { bytes: Uint8Array; w: number; h: number } | null; naf: { bytes: Uint8Array; w: number; h: number } | null }

const pngHref = (b: Uint8Array) => `data:image/png;base64,${Buffer.from(b).toString('base64')}`

/** صف الهوية أعلى اليمين: شعار الأكاديمية ثم شعار ناف بالارتفاع نفسه، أو الرمز والاسم إن لم يُرفع شعار */
function brandRow(b: OgBrand, display: Font, R: number) {
  const H = 56
  if (!b.academy && !b.naf) return `${emblem(R - 56, 76, 56, C.gold, C.gold2)}${text(display, b.name, R - 76, 112, 30, C.ink)}`
  let right = R
  let out = ''
  const place = (img: NonNullable<OgBrand['academy']>) => {
    const w = Math.min(260, (img.w / img.h) * H)
    right -= w
    out += `<image href="${pngHref(img.bytes)}" x="${right}" y="76" width="${w}" height="${H}" preserveAspectRatio="xMidYMid meet"/>`
  }
  /* الأكاديمية (واسمها) ثم الفاصل ثم شركة ناف — الاسم لا يلتصق بشعار الشركة */
  if (b.academy) {
    place(b.academy)
    if (b.showName) { right -= 16; out += text(display, b.name, right, 114, 28, C.ink); right -= widthOf(b.name, display, 28) }
  }
  if (b.naf) {
    if (b.academy) { right -= 22; out += `<rect x="${right}" y="82" width="1.5" height="${H - 12}" fill="${C.gold}" opacity="0.7"/>`; right -= 22 }
    place(b.naf)
  }
  return out
}

export async function ogSvg(o: { kicker?: string; title: string; meta?: string; brand: OgBrand }) {
  if (o.kicker?.trim() === o.brand.name) o = { ...o, kicker: undefined }
  const [display, sans] = [await loadFont(FONTS.display), await loadFont(FONTS.sans)]
  const R = W - 90
  let size = 76
  let lines = wrap(o.title, display, size, 900, 3)
  if (lines.length === 3) { size = 64; lines = wrap(o.title, display, size, 920, 3) }
  const lh = size * 1.32
  /* السطر الأول يبدأ تحت التمهيد مهما طال العنوان */
  const first = (o.kicker ? 232 : 214) + size * 0.82
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${C.bg}"/>
<rect x="28" y="28" width="${W - 56}" height="${H - 56}" fill="none" stroke="${C.gold}" stroke-width="2"/>
<rect x="38" y="38" width="${W - 76}" height="${H - 76}" fill="none" stroke="${C.line}" stroke-width="1"/>
${o.brand.academy ? '' : emblem(70, H - 330, 300, C.gold, C.gold2, 0.13)}
${brandRow(o.brand, display, R)}
${o.kicker ? text(sans, o.kicker, R, 186, 28, C.gold) : ''}
${lines.map((l, i) => text(display, l, R, first + i * lh, size, C.ink)).join('\n')}
${o.meta ? text(sans, o.meta, R, H - 92, 28, C.soft) : ''}
<rect x="${R - 120}" y="${H - 70}" width="120" height="4" rx="2" fill="${C.gold}"/>
</svg>`
}
