'use client'
/* الدورات القادمة — التمرير العمودي يحرّك رفّاً أفقياً من البطاقات على خط زمني.
   طول القسم يُحسب من عرض الرف، فيبقى التمرير أصلياً ونسبته صادقة. */
import { useEffect, useRef, type ReactNode } from 'react'
import { Words } from '@/components/Words'
import { pinProgress, subscribe } from '@/motion/scroll-bus'
import { prefersCalm } from '@/motion/tokens'
import styles from './Timeline.module.css'

export function Timeline({ children, count }: { children: ReactNode; count: number }) {
  const sec = useRef<HTMLElement>(null)
  const track = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const s = sec.current
    const t = track.current
    if (!s || !t || prefersCalm()) return
    const mq = matchMedia('(max-width: 720px)')
    let dist = 0
    const size = () => {
      if (mq.matches) { s.style.blockSize = ''; dist = 0; t.style.transform = ''; return }
      dist = Math.max(0, t.scrollWidth - document.documentElement.clientWidth)
      s.style.blockSize = `${dist + innerHeight}px`
    }
    size()
    const ro = new ResizeObserver(size)
    ro.observe(t)
    let p = 0
    const off = subscribe({
      read: ({ vh }) => { p = dist ? pinProgress(s.getBoundingClientRect(), vh) : 0 },
      write: () => {
        if (!dist) return
        t.style.transform = `translate3d(${(p * dist).toFixed(1)}px,0,0)`
        s.style.setProperty('--p', p.toFixed(4))
      },
    })
    return () => { off(); ro.disconnect() }
  }, [])

  return (
    <section ref={sec} id="courses" className={styles.timeline} aria-labelledby="courses-title">
      <div className={styles.stage}>
        <div className={`wrap ${styles.head}`}>
          <span className="eyebrow">الدورات القادمة</span>
          <Words as="h2" id="courses-title" text="مقاعد محدودة، ومواعيد قريبة." className="scene-title" />
          <a href="/courses" className={styles.all}>كل الدورات <span className="num">({count})</span></a>
        </div>
        <div className={styles.rail}>
          <div className={styles.line} aria-hidden="true"><span /></div>
          <div ref={track} className={styles.track}>{children}</div>
        </div>
      </div>
    </section>
  )
}
