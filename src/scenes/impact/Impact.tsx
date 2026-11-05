/* الأثر بالأرقام — عدّادات تتصاعد مرة واحدة عند الظهور (data-count العام). */
import type { Stat } from '@/content/types'
import styles from './Impact.module.css'

const fmt = new Intl.NumberFormat('en-US')

export function Impact({ stats }: { stats: Stat[] }) {
  /* العدّاد العام data-count (src/motion/reveal.ts): يثبّت العرض ويحرّك عقدة النص نفسها مرة واحدة، ويحترم تقليل الحركة */
  return (
    <section id="impact" data-surface="night" className={styles.impact} aria-label="الأكاديمية بالأرقام">
      <div className={`wrap ${styles.grid}`}>
        {stats.map((s, i) => (
          <div key={s.label} className={`reveal ${styles.stat}`} style={{ ['--d' as string]: i }}>
            <span className={`${styles.value} num`}>
              <span data-count>{fmt.format(s.value)}</span>
              {s.suffix && <span className={styles.suffix}>{s.suffix}</span>}
            </span>
            <span className={styles.label}>{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
