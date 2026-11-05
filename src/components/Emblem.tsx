/* علامة الأكاديمية الافتراضية: الكتاب المفتوح ومعيّنه الذهبي — هندسة حزمة الهوية المعتمدة حرفياً (شبكة 100×100).
   تُرسم حين لا يُرفع رمز من اللوحة، والهندسة نفسها تُصدَّر لمشهد الجسيمات وملف PDF وصور المشاركة (EMBLEM). */

export const EMBLEM = {
  /** الصفحتان: تعبئة */
  pages: ['M52 78C62 62 76 50 95 44C80 58 66 70 52 88Z', 'M48 78C38 62 24 50 5 44C20 58 34 70 48 88Z'],
  /** خطّا الورقة: خط 2.6 بأطراف مدوّرة */
  lines: ['M53 70C63 56 75 46 90 40', 'M47 70C37 56 25 46 10 40'],
  lineWidth: 2.6,
  /** المعيّن الذهبي */
  diamond: 'M50 21L59 30L50 39L41 30Z',
  /** الحدود البصرية ومركزها */
  box: { x: 5, y: 21, w: 90, h: 67 },
  center: { x: 50, y: 54.5 },
  /** نقاط التحكم نفسها رقمياً (للصفحة اليمنى؛ اليسرى مرآتها حول x=50) — لأخذ العيّنات في مشهد الجسيمات */
  curves: {
    edge: [[52, 78], [62, 62], [76, 50], [95, 44]],
    fold: [[52, 88], [66, 70], [80, 58], [95, 44]],
    line: [[53, 70], [63, 56], [75, 46], [90, 40]],
  },
} as const

/** `draw`: يتكشّف مرة (الصفحتان تنفتحان من الكعب، والخطان، ثم المعيّن) — للستار ومواضع الحركة */
export function Emblem({ size = 40, className = '', draw = false }: { size?: number; className?: string; draw?: boolean }) {
  const { pages, lines, lineWidth, diamond } = EMBLEM
  return (
    <svg viewBox="4 20 92 69" width={size ? (size * 92) / 69 : undefined} height={size || undefined} className={`emblem ${draw ? 'emblem-draw' : ''} ${className}`} aria-hidden="true">
      {pages.map((d, i) => <path key={d} d={d} fill="currentColor" className="emblem-page" data-side={i ? 'l' : 'r'} />)}
      {lines.map((d, i) => <path key={d} d={d} fill="none" stroke="currentColor" strokeWidth={lineWidth} strokeLinecap="round" className="emblem-line" style={{ ['--i' as string]: i }} />)}
      <path d={diamond} fill="var(--gold-4, currentColor)" className="emblem-dot" />
    </svg>
  )
}
