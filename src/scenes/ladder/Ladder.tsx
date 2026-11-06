'use client'
/* سُلّم الكفاءة — مشهد مثبّت: خط السُّلّم يُرسم مع التمرير، وكل درجة تضيء وتفتح ما تكسبه. */
import { useEffect, useRef, useState } from 'react'
import type { LadderStep } from '@/content/types'
import { Words } from '@/components/Words'
import { Kashida } from '@/components/Kashida'
import { follower, pinProgress, subscribe } from '@/motion/scroll-bus'
import { prefersCalm } from '@/motion/tokens'
import styles from './Ladder.module.css'

export function Ladder({ title, steps, eyebrow = '' }: { title: string; steps: LadderStep[]; eyebrow?: string }) {
  const ref = useRef<HTMLElement>(null)
  const [step, setStep] = useState(0)
  /* خط السُّلّم وحده يقرأ --p */
  const draw = useRef<SVGPathElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const calm = prefersCalm()
    let p = 0
    let last = -1
    const fp = follower()
    return subscribe({
      read: ({ vh }) => { p = calm ? 1 : pinProgress(el.getBoundingClientRect(), vh) },
      write: ({ t }) => {
        /* الخط يُرسم بالمتابِع الناعم، والدرجة تُختار من التقدّم الفعلي */
        const moving = fp.to(p, t)
        draw.current?.style.setProperty('--p', fp.value.toFixed(4))
        const s = Math.min(steps.length - 1, Math.floor(p * steps.length * 0.999 + 0.0001))
        if (s !== last) { last = s; setStep(s) }
        return moving
      },
    })
  }, [steps.length])

  /* مسار السُّلّم: من أسفل اليمين صعوداً إلى أعلى اليسار */
  const path = 'M 300 250 L 300 200 L 200 200 L 200 120 L 100 120 L 100 40 L 0 40'

  return (
    <section ref={ref} id="ladder" className={styles.ladder} aria-labelledby="ladder-title">
      <div className={styles.stage}>
        <div className={`wrap ${styles.grid}`}>
          <div className={styles.side}>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <Words as="h2" id="ladder-title" text={title} className={`scene-title ${styles.title}`} />
            <svg viewBox="-10 20 320 240" className={styles.svg} aria-hidden="true">
              <path d={path} className={styles.track} />
              <path ref={draw} d={path} className={styles.draw} pathLength={1} />
              {[{ x: 250, y: 200 }, { x: 150, y: 120 }, { x: 50, y: 40 }].map((c, i) => (
                <g key={i} className={styles.node} data-on={i <= step ? '1' : '0'}>
                  <circle cx={c.x} cy={c.y} r="9" />
                  <circle cx={c.x} cy={c.y} r="18" className={styles.halo} />
                </g>
              ))}
            </svg>
          </div>

          <ol className={styles.panels} role="list">
            {steps.map((s, i) => (
              <li key={s.level} className={styles.panel} data-state={i === step ? 'on' : i < step ? 'past' : 'next'}>
                <span className={`${styles.num} num`}>{String(i + 1).padStart(2, '0')}</span>
                <span className={styles.kicker}>{s.name}</span>
                <h3 className={styles.name}><Kashida text={s.title} active={i === step} /></h3>
                <p className={styles.body}>{s.body}</p>
                <ul role="list" className={styles.gains}>
                  {s.gains.map((g, k) => <li key={k} style={{ ['--k' as string]: k }}>{g}</li>)}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
