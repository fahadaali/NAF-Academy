/* محرّك الكشيدة — خط ثمانية يمدّ الحرف بخمس درجات إذا تلته مدّات (ـ U+0640)،
   ويمدّ الفتحة معها عبر ss03…ss07. نكتب في المحتوى علامة الموضع: «بالمم~4ارسة»
   (~ ثم الدرجة القصوى 1–5، والافتراضي 3)، ويحرّكها المحرّك من 0 إلى قصواها. */

export const TATWEEL = 'ـ'
export const MAX_LEVEL = 5
const MARK = /~([1-5])?/g

export type Piece = { text: string } | { slot: number; max: number }

/** يقسّم النص إلى قطع نصية وفتحات كشيدة */
export function parse(src: string): Piece[] {
  const out: Piece[] = []
  let last = 0
  let slot = 0
  for (const m of src.matchAll(MARK)) {
    if (m.index! > last) out.push({ text: src.slice(last, m.index) })
    out.push({ slot: slot++, max: m[1] ? Number(m[1]) : 3 })
    last = m.index! + m[0].length
  }
  if (last < src.length) out.push({ text: src.slice(last) })
  return out
}

/** النص بلا علامات — لقارئ الشاشة والبحث */
export const plain = (src: string) => src.replace(MARK, '')

export const hasMark = (src: string) => /~/.test(src)

/** عدد المدّات لفتحة عند تقدّم k (0 = بلا مدّ، 1 = القصوى، وما فوقها حتى 5) */
export function level(max: number, k: number): number {
  return Math.max(0, Math.min(MAX_LEVEL, Math.round(max * k)))
}

/** يبني النص المعروض عند تقدّم k */
export function render(pieces: Piece[], k: number): string {
  return pieces.map((p) => ('text' in p ? p.text : TATWEEL.repeat(level(p.max, k)))).join('')
}

/** إعداد امتداد الفتحة المطابق لأطول مدّ في الكلمة (ss03 لمدّة واحدة … ss07 لخمس) */
export function fathaFeature(pieces: Piece[], k: number): string | undefined {
  const top = Math.max(0, ...pieces.map((p) => ('slot' in p ? level(p.max, k) : 0)))
  return top > 0 ? `'ss0${top + 2}' 1` : undefined
}
