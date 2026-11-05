'use client'
/* المشهد الافتتاحي المثبّت: العنوان فوق غبار ذهبي، ثم يتحوّل الغبار بالتمرير إلى
   سطور نص، فسُلّم، فعلامة الأكاديمية. التقدّم من ناقل التمرير، والخمول من rAF
   يعمل فقط حين يكون المشهد على الشاشة. */
import { useEffect, useRef, useState } from 'react'
import { Words } from '@/components/Words'
import { Emblem } from '@/components/Emblem'
import { pinProgress, subscribe } from '@/motion/scroll-bus'
import { clamp01, prefersCalm } from '@/motion/tokens'
import { layoutField, makeField, makeRenderer, stepField, type Pointer } from './particles'
import styles from './Opening.module.css'

type Props = {
  eyebrow: string
  lines: string[]
  phases: { at: number; text: string }[]
  cta: { label: string; href: string }
}

export function Opening({ eyebrow, lines, phases, cta }: Props) {
  const section = useRef<HTMLElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState(-1)
  const [live, setLive] = useState(false)

  /* العنوان يتكشّف بعد رفع الستار أو فوراً إن لم يكن ستار */
  useEffect(() => {
    const root = document.documentElement
    const show = () => setLive(true)
    if (root.classList.contains('opening')) {
      document.addEventListener('academy:unveil', show, { once: true })
      const fallback = setTimeout(show, 5400)
      return () => {
        document.removeEventListener('academy:unveil', show)
        clearTimeout(fallback)
      }
    }
    const id = requestAnimationFrame(show)
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    const sec = section.current
    const cv = canvas.current
    const st = stage.current
    if (!sec || !cv || !st) return
    const calm = prefersCalm()
    const small = matchMedia('(max-width: 720px)').matches
    const nav = navigator as Navigator & { deviceMemory?: number }
    const modest = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4
    const field = makeField(calm ? 900 : modest ? 1100 : small ? 1300 : 2400)
    let renderer: ReturnType<typeof makeRenderer> = null
    let w = 0, h = 0, dpr = 1
    const size = () => {
      if (!renderer) return
      const r = st.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = r.width
      h = r.height
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
      renderer.resize(cv.width, cv.height)
      layoutField(field, { w, h })
    }
    const ro = new ResizeObserver(size)

    let p = 0
    let rect: DOMRect | null = null
    let lastPhase = -1
    const ptr: Pointer = { x: -9999, y: -9999, on: 0 }
    const target = { x: -9999, y: -9999, on: 0 }

    const off = subscribe({
      read: ({ vh }) => {
        rect = sec.getBoundingClientRect()
        p = calm ? 1 : pinProgress(rect, vh)
      },
      write: () => {
        sec.style.setProperty('--p', p.toFixed(4))
        sec.style.setProperty('--head', clamp01(1 - p / 0.1).toFixed(3))
        let ph = -1
        phases.forEach((x, i) => { if (p >= x.at - 0.07) ph = i })
        if (ph !== lastPhase) { lastPhase = ph; setPhase(ph) }
      },
    })

    const onMove = (e: PointerEvent) => {
      const r = st.getBoundingClientRect()
      target.x = e.clientX - r.left
      target.y = e.clientY - r.top
      target.on = 1
    }
    const onLeave = () => { target.on = 0 }
    st.addEventListener('pointermove', onMove, { passive: true })
    st.addEventListener('pointerleave', onLeave)

    let raf = 0
    let visible = true
    const loop = (t: number) => {
      ptr.x += (target.x - ptr.x) * 0.12
      ptr.y += (target.y - ptr.y) * 0.12
      ptr.on += (target.on - ptr.on) * 0.08
      if (!renderer) return
      stepField(field, p, t, ptr, dpr)
      renderer.draw(field, cv.width, cv.height)
      if (visible && !calm) raf = requestAnimationFrame(loop)
    }
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      cancelAnimationFrame(raf)
      if (visible && renderer) raf = requestAnimationFrame(loop)
    })

    /* المشهد الثقيل يُبنى بعد أول رسم وفي وقت الفراغ — لا يزاحم تحميل الصفحة */
    let started = false
    const start = () => {
      if (started) return
      started = true
      renderer = makeRenderer(cv)
      if (!renderer) return
      size()
      ro.observe(st)
      io.observe(st)
      if (calm) requestAnimationFrame(loop)
    }
    const w8 = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
    const idle = () => (w8.requestIdleCallback ? w8.requestIdleCallback(start, { timeout: 1200 }) : setTimeout(start, 300))
    if (document.documentElement.classList.contains('opening')) document.addEventListener('academy:unveil', idle, { once: true })
    else idle()

    return () => {
      off()
      started = true
      document.removeEventListener('academy:unveil', idle)
      ro.disconnect()
      io.disconnect()
      cancelAnimationFrame(raf)
      st.removeEventListener('pointermove', onMove)
      st.removeEventListener('pointerleave', onLeave)
    }
  }, [phases])

  return (
    <section ref={section} id="top" data-surface="night" className={styles.opening} aria-label="البداية">
      <div ref={stage} className={styles.stage}>
        <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />
        <div className={styles.vignette} aria-hidden="true" />

        <div className={`wrap ${styles.head}`}>
          <span className={`eyebrow ${styles.eyebrow}`} data-live={live ? '1' : '0'}>{eyebrow}</span>
          <Words as="h1" text={lines} manual className={`${styles.title} ${live ? 'in' : ''}`} />
          <div className={styles.hint} data-live={live ? '1' : '0'} aria-hidden="true">
            <span className={styles.mouse}><span /></span>
            مرّر لتكتشف
          </div>
        </div>

        <ol className={styles.phases} role="list">
          {phases.map((x, i) => (
            <li key={i} data-on={phase === i ? '1' : '0'} className={styles.phase}>
              <Words text={x.text} manual className={phase === i ? 'in' : ''} />
            </li>
          ))}
        </ol>

        <div className={styles.final} data-on={phase === phases.length - 1 ? '1' : '0'}>
          <a href={cta.href} className="btn">{cta.label}</a>
        </div>

        <div className={styles.calmMark} aria-hidden="true"><Emblem size={220} /></div>
        <div className={styles.meter} aria-hidden="true"><span /></div>
      </div>
    </section>
  )
}
