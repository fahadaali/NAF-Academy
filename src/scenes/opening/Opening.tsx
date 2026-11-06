'use client'
/* المشهد الافتتاحي المثبّت: العنوان فوق غبار ذهبي، ثم يتحوّل الغبار بالتمرير إلى
   سطور نص، فسُلّم، فعلامة الأكاديمية. التقدّم من ناقل التمرير، والخمول من rAF
   يعمل فقط حين يكون المشهد على الشاشة. */
import { useEffect, useRef, useState } from 'react'
import { Words } from '@/components/Words'
import { Emblem } from '@/components/Emblem'
import { follower, pinProgress, subscribe } from '@/motion/scroll-bus'
import { clamp01, duration, prefersCalm, timing } from '@/motion/tokens'
import type { Pointer } from './particles'
import styles from './Opening.module.css'

type Props = {
  eyebrow: string
  lines: string[]
  phases: { at: number; text: string }[]
  cta: { label: string; href: string }
  /** شعار الأكاديمية المرفوع (نسخة الخلفيات الداكنة) — تتشكّل منه الجسيمات */
  logo?: { url: string; w: number; h: number } | null
  /** نسخة الخلفيات الفاتحة — للعلامة الثابتة مع تقليل الحركة في الوضع الفاتح (الجسيمات تأخذ شكلها من أي نسخة) */
  logoLight?: { url: string; w: number; h: number } | null
  logoAlt?: string
}

export function Opening({ eyebrow, lines, phases, cta, logo, logoLight, logoAlt = '' }: Props) {
  const section = useRef<HTMLElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  /* متغيرات التمرير تُكتب على العناصر التي تقرؤها وحدها — كتابتها على القسم تعيد حساب أنماط المشهد كله كل إطار */
  const headRef = useRef<HTMLDivElement>(null)
  const vignette = useRef<HTMLDivElement>(null)
  const meter = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState(-1)
  const [live, setLive] = useState(false)

  /* العنوان يتكشّف بعد رفع الستار أو فوراً إن لم يكن ستار */
  useEffect(() => {
    const root = document.documentElement
    const show = () => setLive(true)
    if (root.classList.contains('opening')) {
      document.addEventListener('academy:unveil', show, { once: true })
      /* احتياط إن لم يصل حدث رفع الستار: بعد سقفه بقليل */
      const fallback = setTimeout(show, timing.curtainMax + duration.gentle * 2)
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
    /* محرّك الجسيمات يُحمَّل كسولاً عند بدء المشهد (بعد أول رسم) — لا يثقل حزمة الصفحة */
    type Engine = typeof import('./particles')
    let eng: Engine | null = null
    let field: ReturnType<Engine['makeField']> | null = null
    let renderer: ReturnType<Engine['makeRenderer']> = null
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
      if (eng && field) eng.layoutField(field, { w, h }, mask)
    }
    /* شعار مرفوع: نقاطه من بكسلاته المعتمة، ثم يُعاد التخطيط */
    let mask: Float32Array | null = null
    if (logo) {
      const im = new Image()
      im.onload = () => {
        const N = 160, c = document.createElement('canvas'); c.width = N; c.height = N
        const x = c.getContext('2d', { willReadFrequently: true })
        if (!x) return
        const k = Math.min(N / im.naturalWidth, N / im.naturalHeight)
        const dw = im.naturalWidth * k, dh = im.naturalHeight * k
        x.drawImage(im, (N - dw) / 2, (N - dh) / 2, dw, dh)
        const d = x.getImageData(0, 0, N, N).data
        const pts: number[] = []
        for (let yy = 0; yy < N; yy++) for (let xx = 0; xx < N; xx++) if (d[(yy * N + xx) * 4 + 3] > 140) pts.push(xx / N, yy / N)
        if (pts.length > 40) { mask = new Float32Array(pts); size() }
      }
      im.src = logo.url
    }
    const ro = new ResizeObserver(size)
    /* تبديل الوضع (من الزر أو من الجهاز): لون الجسيمات يُقرأ من الرموز من جديد، ويُعاد الرسم إن كان المشهد ساكناً */
    const recolor = () => requestAnimationFrame(() => {
      renderer?.recolor()
      if (renderer && eng && field && (calm || !visible)) renderer.draw(field, cv.width, cv.height)
    })
    const scheme = matchMedia('(prefers-color-scheme: dark)')
    document.addEventListener('academy:theme', recolor)
    scheme.addEventListener('change', recolor)

    /* raw: تقدّم التمرير كما هو؛ p: المتابِع الناعم الذي يقرؤه المشهد والجسيمات */
    let raw = 0
    let p = 0
    const fp = follower()
    let rect: DOMRect | null = null
    let lastPhase = -1
    let lastP = ''
    const ptr: Pointer = { x: -9999, y: -9999, on: 0 }
    const target = { x: -9999, y: -9999, on: 0 }

    const off = subscribe({
      read: ({ vh }) => {
        rect = sec.getBoundingClientRect()
        raw = calm ? 1 : pinProgress(rect, vh)
      },
      write: ({ t }) => {
        const moving = fp.to(raw, t)
        p = fp.value
        const pv = p.toFixed(4)
        if (pv !== lastP) {
          lastP = pv
          vignette.current?.style.setProperty('--p', pv)
          meter.current?.style.setProperty('--p', pv)
          headRef.current?.style.setProperty('--head', clamp01(1 - p / 0.1).toFixed(3))
        }
        let ph = -1
        phases.forEach((x, i) => { if (p >= x.at - 0.07) ph = i })
        if (ph !== lastPhase) { lastPhase = ph; setPhase(ph) }
        return moving
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
    let lastT = 0
    const loop = (t: number) => {
      /* المؤشر يُتابَع بزمن الإطار الفعلي — السرعة نفسها على 60 و120 هرتز */
      const dt = lastT && t - lastT < 100 ? t - lastT : 1000 / 60
      lastT = t
      const kp = 1 - Math.exp(-dt / (timing.follow * 1.4))
      const ko = 1 - Math.exp(-dt / (timing.follow * 2.2))
      ptr.x += (target.x - ptr.x) * kp
      ptr.y += (target.y - ptr.y) * kp
      ptr.on += (target.on - ptr.on) * ko
      if (!renderer || !eng || !field) return
      eng.stepField(field, p, t, ptr, dpr)
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
    let gone = false
    const start = async () => {
      if (started) return
      started = true
      eng = await import('./particles')
      if (gone) return
      field = eng.makeField(calm ? 900 : modest ? 1100 : small ? 1300 : 2400)
      renderer = eng.makeRenderer(cv)
      if (!renderer) return
      size()
      ro.observe(st)
      io.observe(st)
      if (calm) requestAnimationFrame(loop)
    }
    const w8 = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
    const go = () => { void start() }
    const idle = () => (w8.requestIdleCallback ? w8.requestIdleCallback(go, { timeout: timing.curtain }) : setTimeout(go, duration.gentle))
    if (document.documentElement.classList.contains('opening')) document.addEventListener('academy:unveil', idle, { once: true })
    else idle()

    return () => {
      off()
      started = true
      gone = true
      document.removeEventListener('academy:unveil', idle)
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('academy:theme', recolor)
      scheme.removeEventListener('change', recolor)
      cancelAnimationFrame(raf)
      st.removeEventListener('pointermove', onMove)
      st.removeEventListener('pointerleave', onLeave)
    }
  }, [phases])

  return (
    <section ref={section} id="top" data-surface="night" className={styles.opening} aria-label="البداية">
      <div ref={stage} className={styles.stage}>
        <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />
        <div ref={vignette} className={styles.vignette} aria-hidden="true" />

        <div ref={headRef} className={`wrap ${styles.head}`}>
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

        <div className={styles.calmMark} aria-hidden="true">
          {logo ? (
            logoLight && logoLight.url !== logo.url ? (
              <>
                <img src={logoLight.url} alt={logoAlt} className={`logo-on-light ${styles.calmImg}`} />
                <img src={logo.url} alt={logoAlt} className={`logo-on-dark ${styles.calmImg}`} />
              </>
            ) : <img src={logo.url} alt={logoAlt} className={styles.calmImg} />
          ) : <Emblem size={220} />}
        </div>
        <div ref={meter} className={styles.meter} aria-hidden="true"><span /></div>
      </div>
    </section>
  )
}
