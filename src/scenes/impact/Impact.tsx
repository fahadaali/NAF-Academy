'use client'
/* الأثر بالأرقام — عدّادات تتصاعد مرة واحدة عند الظهور بمنحنى glide. */
import { useEffect, useRef } from 'react'
import type { Stat } from '@/content/types'
import { ease, prefersCalm, timing } from '@/motion/tokens'
import styles from './Impact.module.css'

const fmt = new Intl.NumberFormat('en-US')

export function Impact({ stats }: { stats: Stat[] }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const nums = Array.from(el.querySelectorAll<HTMLElement>('[data-to]'))
    if (prefersCalm()) return
    nums.forEach((n) => (n.textContent = '0'))
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      const t0 = performance.now()
      const tick = (t: number) => {
        const k = ease.glide(Math.min(1, (t - t0) / timing.count))
        nums.forEach((n) => (n.textContent = fmt.format(Math.round(Number(n.dataset.to) * k))))
        if (k < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, { threshold: 0.4 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <section ref={ref} id="impact" data-surface="night" className={styles.impact} aria-label="الأكاديمية بالأرقام">
      <div className={`wrap ${styles.grid}`}>
        {stats.map((s, i) => (
          <div key={s.label} className={`reveal ${styles.stat}`} style={{ ['--d' as string]: i }}>
            <span className={`${styles.value} num`}>
              <span data-to={s.value}>{fmt.format(s.value)}</span>
              {s.suffix && <span className={styles.suffix}>{s.suffix}</span>}
            </span>
            <span className={styles.label}>{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
