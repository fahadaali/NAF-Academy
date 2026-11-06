'use client'
/* كلمة تمتدّ بالكشيدة. ثلاثة أنماط:
   - تلقائي: تمتدّ حين يتكشّف العنوان الحاوي (.words تتلقّى .in)، وتزيد عند المرور فوقه.
   - متحكَّم: `active` من الأب (مثل درجات السُّلّم).
   - `boost`: نسبة الامتداد عند المرور (الافتراضي 1.7 من القصوى، بسقف خمس مدّات).

   النعومة: المدّة (ـ) حرف كامل، فالعدّ الصحيح وحده يقفز درجةً درجة. للفتحة الواحدة نرسم الكلمة طبقتين مشكَّلتين صحيحاً:
   «الرأس» (ما قبل الفتحة + خمس مدّات) و«الذيل» (مدّات + ما بعدها)، ونكشف الرأس ونقصّ الذيل بـ clip-path بقيمة متصلة،
   فيطول الخط بين الحرفين بكسلاً بكسلاً وعرض الكلمة يتبعه. كل إطار يكتب في DOM مباشرة — لا إعادة رسم React.
   الكلمة بأكثر من فتحة تعود إلى العدّ الصحيح (نصاً لا يُكتب إلا عند تغيّر الدرجة). */
import { useEffect, useMemo, useRef } from 'react'
import { fathaFeature, MAX_LEVEL, parse, plain, render, TATWEEL } from '@/motion/kashida'
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

/* حافة تداخل الطبقتين (px) حتى لا يظهر شقّ بين الرأس والذيل */
const SEAM = 1

export function Kashida({ text, active, delay = timing.reveal * 0.55, boost = 1.7, className = '', decorative }: Props) {
  const pieces = useMemo(() => parse(text), [text])
  const split = useMemo(() => {
    const slots = pieces.filter((p) => 'slot' in p)
    if (slots.length !== 1) return null
    const at = pieces.findIndex((p) => 'slot' in p)
    const txt = (xs: typeof pieces) => xs.map((p) => ('text' in p ? p.text : '')).join('')
    return { head: txt(pieces.slice(0, at)), tail: txt(pieces.slice(at + 1)), max: (slots[0] as { max: number }).max }
  }, [pieces])

  const root = useRef<HTMLSpanElement>(null)
  const strut = useRef<HTMLSpanElement>(null)
  const head = useRef<HTMLSpanElement>(null)
  const tail = useRef<HTMLSpanElement>(null)
  const xRef = useRef(0)
  const raf = useRef(0)
  const paint = useRef<(k: number) => void>(() => {})

  /* الرسم: k تقدّم 0…boost، يُحوَّل إلى عدد مدّات متصل */
  useEffect(() => {
    const el = root.current, st = strut.current, hd = head.current, tl = tail.current
    if (!el || !st) return
    const topOf = (k: number) => Math.min(MAX_LEVEL, (split?.max ?? 3) * k)
    let geo: { w: number; wp: number; ws: number; hp: number } | null = null
    let tailN = -1
    let lastText = ''
    let rtl = true

    const measure = () => {
      if (!split || !hd || !tl) return
      rtl = getComputedStyle(el).direction !== 'ltr'
      const probe = document.createElement('span')
      probe.className = 'k-probe'
      el.appendChild(probe)
      const W = (s: string) => { probe.textContent = s; return probe.getBoundingClientRect().width }
      const hp = W(split.head + TATWEEL.repeat(MAX_LEVEL))
      const h1 = W(split.head + TATWEEL)
      const t1 = W(TATWEEL + split.tail)
      probe.remove()
      const w = (hp - h1) / (MAX_LEVEL - 1)
      geo = w > 0.5 ? { w, wp: h1 - w, ws: t1 - w, hp } : null
      tailN = -1
    }

    /* العدّ الصحيح: للكلمة بعدة فتحات أو قبل جاهزية القياس */
    const discrete = (k: number) => {
      el.removeAttribute('data-k')
      el.style.inlineSize = ''
      const s = render(pieces, k)
      if (s !== lastText) {
        lastText = s
        st.textContent = s
        const ss = fathaFeature(pieces, k)
        st.style.fontFeatureSettings = ss ? `${ss}, 'swsh' var(--swsh, 0)` : ''
      }
    }

    paint.current = (k: number) => {
      const x = topOf(k)
      if (!geo || !hd || !tl || x <= 0.001) {
        discrete(k)
        return
      }
      const { w, wp, ws, hp } = geo
      const n = Math.max(1, Math.floor(x + 1e-6))
      if (n !== tailN) {
        tailN = n
        tl.textContent = TATWEEL.repeat(n) + split!.tail
        tl.style.fontFeatureSettings = `'ss0${n + 2}' 1, 'swsh' var(--swsh, 0)`
      }
      const shown = Math.min(x, n) // مدّات الذيل الظاهرة
      const tw = ws + n * w
      const headVis = wp + (x - shown) * w + SEAM
      const cutHead = Math.max(0, hp - headVis)
      const cutTail = Math.max(0, tw - (ws + shown * w))
      /* الرأس مثبّت ببداية السطر والذيل بنهايته؛ نقصّ الجهة المقابلة */
      hd.style.clipPath = rtl ? `inset(-1em -1em -1em ${cutHead}px)` : `inset(-1em ${cutHead}px -1em -1em)`
      tl.style.clipPath = rtl ? `inset(-1em ${cutTail}px -1em -1em)` : `inset(-1em -1em -1em ${cutTail}px)`
      el.style.inlineSize = `${wp + x * w + ws}px`
      el.setAttribute('data-k', 'live')
    }

    let alive = true
    const ready = document.fonts?.ready ?? Promise.resolve()
    void ready.then(() => { if (!alive) return; measure(); paint.current(xRef.current) })
    let pending = 0
    const onResize = () => {
      cancelAnimationFrame(pending)
      pending = requestAnimationFrame(() => { measure(); paint.current(xRef.current) })
    }
    addEventListener('resize', onResize, { passive: true })
    return () => {
      alive = false
      cancelAnimationFrame(pending)
      removeEventListener('resize', onResize)
    }
  }, [pieces, split])

  /* يحرّك k نحو هدف بمنحنى travel — المدة نفسها، والقيمة متصلة */
  const go = useRef((to: number, dur = timing.reveal) => {
    cancelAnimationFrame(raf.current)
    if (prefersCalm()) {
      xRef.current = to
      paint.current(to)
      return
    }
    const from = xRef.current
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - t0) / dur))
      const v = from + (to - from) * ease.travel(p)
      xRef.current = v
      paint.current(v)
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
    const el = root.current
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

  return (
    <>
      {!decorative && <span className="sr-only">{plain(text)}</span>}
      <span ref={root} className={`kashida ${className}`} aria-hidden="true">
        <span ref={strut} className="k-strut">{render(pieces, 0)}</span>
        {split && (
          <>
            <span ref={head} className="k-layer k-head">{split.head + TATWEEL.repeat(MAX_LEVEL)}</span>
            <span ref={tail} className="k-layer k-tail">{TATWEEL + split.tail}</span>
          </>
        )}
      </span>
    </>
  )
}
