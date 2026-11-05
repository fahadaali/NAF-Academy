'use client'
/* كلمة تمتدّ بالكشيدة. ثلاثة أنماط:
   - تلقائي: تمتدّ حين يتكشّف العنوان الحاوي (.words تتلقّى .in)، وتزيد عند المرور فوقه.
   - متحكَّم: `active` من الأب (مثل درجات السُّلّم).
   - `boost`: نسبة الامتداد عند المرور (الافتراضي 1.7 من القصوى، بسقف خمس مدّات). */
import { useEffect, useMemo, useRef, useState } from 'react'
import { fathaFeature, parse, plain, render } from '@/motion/kashida'
import { ease, prefersCalm, timing } from '@/motion/tokens'

type Props = {
  text: string
  active?: boolean
  /** تأخير بعد التكشّف بالمللي ثانية */
  delay?: number
  boost?: number
  className?: string
  /** داخل Words: الأب يتولّى النص المقروء */
  decorative?: boolean
}

export function Kashida({ text, active, delay = timing.reveal * 0.55, boost = 1.7, className = '', decorative }: Props) {
  const pieces = useMemo(() => parse(text), [text])
  const [k, setK] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const kRef = useRef(0)
  const raf = useRef(0)

  /* يحرّك k نحو هدف بمنحنى travel — العدد يقفز درجةً درجة فيبدو الحرف ينمو */
  const go = useRef((to: number, dur = timing.reveal) => {
    cancelAnimationFrame(raf.current)
    if (prefersCalm()) {
      kRef.current = to
      setK(to)
      return
    }
    const from = kRef.current
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur)
      const v = from + (to - from) * ease.travel(p)
      kRef.current = v
      setK(v)
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }).current

  /* متحكَّم */
  useEffect(() => {
    if (active === undefined) return
    go(active ? 1 : 0, timing.reveal)
  }, [active, go])

  /* تلقائي */
  useEffect(() => {
    if (active !== undefined) return
    const el = ref.current
    if (!el) return
    const host = el.closest('.words') as HTMLElement | null
    const hover = (el.closest('h1, h2, h3, p, a, button') as HTMLElement | null) ?? el
    let timer: ReturnType<typeof setTimeout> | undefined
    let shown = false
    const start = () => {
      if (shown) return
      shown = true
      timer = setTimeout(() => go(1), delay)
    }
    let mo: MutationObserver | undefined
    let io: IntersectionObserver | undefined
    if (host) {
      if (host.classList.contains('in')) start()
      mo = new MutationObserver(() => host.classList.contains('in') && start())
      mo.observe(host, { attributes: true, attributeFilter: ['class'] })
    } else {
      io = new IntersectionObserver(([e]) => e.isIntersecting && start(), { threshold: 0.6 })
      io.observe(el)
    }
    const enter = () => shown && go(boost, timing.reveal * 0.7)
    const leave = () => shown && go(1, timing.reveal)
    hover.addEventListener('pointerenter', enter)
    hover.addEventListener('pointerleave', leave)
    return () => {
      clearTimeout(timer)
      mo?.disconnect()
      io?.disconnect()
      cancelAnimationFrame(raf.current)
      hover.removeEventListener('pointerenter', enter)
      hover.removeEventListener('pointerleave', leave)
    }
  }, [active, boost, delay, go])

  const shown = render(pieces, k)
  const ss = fathaFeature(pieces, k)
  return (
    <span
      ref={ref}
      className={`kashida ${className}`}
      style={ss ? { fontFeatureSettings: `${ss}, 'swsh' var(--swsh, 0)` } : undefined}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : plain(text)}
      role={decorative ? undefined : 'text'}
    >
      {shown}
    </span>
  )
}
