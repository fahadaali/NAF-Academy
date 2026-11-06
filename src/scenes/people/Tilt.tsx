'use client'
/* ميل خفيف يتبع المؤشر — للفأرة فقط، ويهدأ عند الخروج.
   التنعيم في rAF واحد بزمن الإطار الفعلي (لا انتقال CSS يُعاد تشغيله مع كل حركة فيتقطّع)، ويتوقف حين يستقر. */
import { useEffect, useRef, type ReactNode } from 'react'
import { duration, prefersCalm } from '@/motion/tokens'

/* ثابت الزمن: يبلغ الميل نحو 95% من هدفه في duration.gentle */
const TAU = duration.gentle / 3

export function Tilt({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const st = useRef({ tx: 0, ty: 0, x: 0, y: 0, raf: 0, last: 0 })

  useEffect(() => () => cancelAnimationFrame(st.current.raf), [])

  const run = () => {
    const s = st.current
    if (s.raf) return
    s.last = performance.now()
    const tick = (t: number) => {
      const el = ref.current
      if (!el) { s.raf = 0; return }
      const k = 1 - Math.exp(-(t - s.last) / TAU)
      s.last = t
      s.x += (s.tx - s.x) * k
      s.y += (s.ty - s.y) * k
      const done = Math.abs(s.tx - s.x) < 0.01 && Math.abs(s.ty - s.y) < 0.01
      if (done) { s.x = s.tx; s.y = s.ty }
      el.style.setProperty('--rx', `${(-s.y * 6).toFixed(3)}deg`)
      el.style.setProperty('--ry', `${(s.x * 8).toFixed(3)}deg`)
      s.raf = done ? 0 : requestAnimationFrame(tick)
    }
    s.raf = requestAnimationFrame(tick)
  }

  const onMove = (e: React.PointerEvent) => {
    /* للفأرة فقط، ولا ميل مع تقليل الحركة */
    if (e.pointerType !== 'mouse' || prefersCalm()) return
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    st.current.tx = (e.clientX - r.left) / r.width - 0.5
    st.current.ty = (e.clientY - r.top) / r.height - 0.5
    el.style.setProperty('--mx', `${(e.clientX - r.left).toFixed(0)}px`)
    el.style.setProperty('--my', `${(e.clientY - r.top).toFixed(0)}px`)
    run()
  }
  const onLeave = () => {
    st.current.tx = 0
    st.current.ty = 0
    run()
  }
  return (
    <div ref={ref} className={className} onPointerMove={onMove} onPointerLeave={onLeave}>
      {children}
    </div>
  )
}
