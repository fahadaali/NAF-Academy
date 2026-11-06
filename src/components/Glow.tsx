/* اللمسة المتوهجة حول الشعار — هالة ذهبية، وحبّات متوهجة تتجمّع نحوه، وشعاع ضوء يعبره مرة مقصوصاً على شكله.
   طبقات زخرفية ثابتة الرسم تتحرك بـ transform/opacity — لا تمسّ هندسة الشعار ولا ألوانه (قواعد حزمة الهوية).
   lg للستار، وsm للتذييل (ينتظر تكشّفه داخل .reveal) وصفحة دخول اللوحة. مواضع الحبّات ثابتة (الخادم والمتصفح سواء). */
import type { CSSProperties, ReactNode } from 'react'
import styles from './Glow.module.css'

const grains = (n: number) => Array.from({ length: n }, (_, i) => {
  const a = i * 2.39996 // الزاوية الذهبية
  const r = 0.62 + ((i * 37) % 11) / 22
  return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.55, s: 0.55 + ((i * 13) % 7) / 10, i }
})
const SETS = { lg: grains(12), sm: grains(7) }

export function Glow({ children, shape, size = 'lg', className = '' }: { children: ReactNode; shape?: string | null; size?: 'lg' | 'sm'; className?: string }) {
  return (
    <span className={`${styles.glow} ${className}`} data-glow={size}>
      <span className={styles.halo} aria-hidden="true" />
      <span className={styles.grains} aria-hidden="true">
        {SETS[size].map((g) => (
          <i key={g.i} style={{ '--gx': g.x.toFixed(3), '--gy': g.y.toFixed(3), '--gs': g.s.toFixed(2), '--gi': g.i } as CSSProperties} />
        ))}
      </span>
      <span className={styles.stage}>
        {children}
        {shape && <span className={styles.beam} aria-hidden="true" style={{ '--shape': `url("${shape}")` } as CSSProperties}><span /></span>}
      </span>
    </span>
  )
}
