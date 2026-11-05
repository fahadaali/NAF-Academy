'use client'
/* ميل خفيف يتبع المؤشر — للفأرة فقط، ويهدأ عند الخروج. */
import { useRef, type ReactNode } from 'react'
import { prefersCalm } from '@/motion/tokens'

export function Tilt({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const raf = useRef(0)
  const onMove = (e: React.PointerEvent) => {
    /* للفأرة فقط، ولا ميل مع تقليل الحركة */
    if (e.pointerType !== 'mouse' || prefersCalm()) return
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => {
      el.style.setProperty('--rx', `${(-y * 6).toFixed(2)}deg`)
      el.style.setProperty('--ry', `${(x * 8).toFixed(2)}deg`)
      el.style.setProperty('--mx', `${(e.clientX - r.left).toFixed(0)}px`)
      el.style.setProperty('--my', `${(e.clientY - r.top).toFixed(0)}px`)
    })
  }
  const onLeave = () => {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
  }
  return (
    <div ref={ref} className={className} onPointerMove={onMove} onPointerLeave={onLeave}>
      {children}
    </div>
  )
}
