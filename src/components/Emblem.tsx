/* علامة الأكاديمية: سُلّم من ثلاث درجات داخل حلقة، تعلوه نقطة — الدرجة الأعلى في اتجاه القراءة.
   الهندسة نفسها تُصدَّر لمشهد الجسيمات (EMBLEM) فيتطابق الشكلان. */

export const EMBLEM = {
  ring: { cx: 50, cy: 50, r: 44 },
  bars: [
    { x: 60, y: 58, w: 10, h: 16 },
    { x: 45, y: 46, w: 10, h: 28 },
    { x: 30, y: 34, w: 10, h: 40 },
  ],
  dot: { x: 35, y: 24, r: 4.2 },
} as const

export function Emblem({ size = 40, className = '', draw = false }: { size?: number; className?: string; draw?: boolean }) {
  const { ring, bars, dot } = EMBLEM
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={`emblem ${draw ? 'emblem-draw' : ''} ${className}`} aria-hidden="true">
      <circle cx={ring.cx} cy={ring.cy} r={ring.r} fill="none" stroke="currentColor" strokeWidth="3" pathLength={1} className="emblem-ring" />
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx="1.6" fill="currentColor" className="emblem-bar" style={{ ['--i' as string]: i }} />
      ))}
      <rect x={dot.x - dot.r} y={dot.y - dot.r} width={dot.r * 2} height={dot.r * 2} rx="1" transform={`rotate(45 ${dot.x} ${dot.y})`} fill="var(--gold-4, currentColor)" className="emblem-dot" />
    </svg>
  )
}
