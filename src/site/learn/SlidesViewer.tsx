'use client'
/* عارض السلايدات داخل الدرس — ملف PDF يُرسم شريحةً شريحة على canvas بمحرّك pdf.js،
   ويُستورد المحرّك عند الحاجة فقط (import()) والعامل من public/pdfjs (يولّده setup-fonts).
   التقليب بالأزرار وأسهم لوحة المفاتيح (باتجاه القراءة العربية) والسحب على اللمس، وملء الشاشة،
   وعلامة مائية بهوية المتدرب. أبعد شريحة بلغها تُحفظ على الخادم (saveSlide) ويكتمل الدرس بآخرها. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveSlide } from '@/site/learn-actions'
import v from './slides.module.css'

type Doc = { numPages: number; getPage: (n: number) => Promise<Page>; destroy: () => Promise<void> }
type Page = {
  getViewport: (o: { scale: number }) => { width: number; height: number }
  render: (o: { canvas: HTMLCanvasElement; viewport: { width: number; height: number } }) => { promise: Promise<void>; cancel: () => void }
}

export function SlidesViewer(p: {
  slug: string; lessonId: string; src: string; pages: number; start: number; furthest: number
  /** يُحفظ التقدّم للمسجّل فقط — المعاينة تتصفّح بلا حفظ */
  track: boolean; done: boolean; download: string | null; watermark: string
}) {
  const router = useRouter()
  const box = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const doc = useRef<Doc | null>(null)
  const [page, setPage] = useState(Math.min(Math.max(1, p.start), p.pages))
  const [total, setTotal] = useState(p.pages)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [done, setDone] = useState(p.done)
  const [wm, setWm] = useState({ x: 8, y: 10 })
  const furthest = useRef(p.furthest)

  /* تحميل الملف مرة واحدة */
  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = `/pdfjs/pdf.worker-${pdfjs.version}.min.mjs`
        const d = (await pdfjs.getDocument({
          url: p.src, withCredentials: true, disableRange: true, disableStream: true,
          /* خطوط PDF القياسية وجداول الترميز ومفكّكات الصور من public/pdfjs (يولّدها setup-fonts). والـcanvas باتجاه ltr: ترث الصفحة rtl فتنقلب مواضع الحروف */
          standardFontDataUrl: `/pdfjs/${pdfjs.version}/standard_fonts/`, cMapUrl: `/pdfjs/${pdfjs.version}/cmaps/`, cMapPacked: true, wasmUrl: `/pdfjs/${pdfjs.version}/wasm/`,
        }).promise) as unknown as Doc
        if (dead) { d.destroy(); return }
        doc.current = d
        setTotal(d.numPages)
        setState('ready')
      } catch {
        if (!dead) setState('error')
      }
    })()
    return () => { dead = true; doc.current?.destroy(); doc.current = null }
  }, [p.src])

  /* رسم الشريحة الحالية بعرض المسرح × كثافة الشاشة — ويُعاد عند تغيّر المقاس */
  useEffect(() => {
    if (state !== 'ready') return
    let task: { cancel: () => void } | null = null
    let frame = 0
    const draw = async () => {
      const d = doc.current, c = canvas.current, s = stage.current
      if (!d || !c || !s) return
      const pg = await d.getPage(page)
      const base = pg.getViewport({ scale: 1 })
      /* تتسع الشريحة للمسرح عرضاً وارتفاعاً (ملء الشاشة) */
      const fit = Math.min(s.clientWidth / base.width, (s.clientHeight || Infinity) / base.height)
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      const vp = pg.getViewport({ scale: fit * dpr })
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height)
      c.style.setProperty('--w', `${Math.floor(vp.width / dpr)}px`)
      c.style.setProperty('--ar', `${base.width} / ${base.height}`)
      task?.cancel()
      const t = pg.render({ canvas: c, viewport: vp })
      task = t
      await t.promise.catch(() => {})
    }
    draw()
    const ro = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { draw() }) })
    if (stage.current) ro.observe(stage.current)
    return () => { ro.disconnect(); cancelAnimationFrame(frame); task?.cancel() }
  }, [page, state])

  /* حفظ أبعد شريحة — لا طلب إلا حين يتجاوز ما بلغه */
  useEffect(() => {
    if (!p.track || state !== 'ready' || page <= furthest.current || done) return
    furthest.current = page
    saveSlide(p.slug, p.lessonId, page).then((r) => {
      furthest.current = Math.max(furthest.current, r.furthest)
      if (r.done) { setDone(true); router.refresh() }
    }).catch(() => {})
  }, [page, state, p.track, p.slug, p.lessonId, done, router])

  /* العلامة المائية تنتقل كل حين (كما في مشغّل الفيديو) */
  useEffect(() => {
    if (!p.watermark) return
    const id = window.setInterval(() => setWm({ x: 4 + Math.random() * 60, y: 6 + Math.random() * 80 }), 20_000)
    return () => window.clearInterval(id)
  }, [p.watermark])

  const go = useCallback((n: number) => setPage((cur) => Math.min(Math.max(1, cur + n), total)), [total])
  const onKey = (e: React.KeyboardEvent) => {
    /* اتجاه القراءة العربية: التالي إلى اليسار */
    if (e.key === 'ArrowLeft' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); go(1) }
    else if (e.key === 'ArrowRight' || e.key === 'PageUp') { e.preventDefault(); go(-1) }
    else if (e.key === 'Home') { e.preventDefault(); setPage(1) }
    else if (e.key === 'End') { e.preventDefault(); setPage(total) }
  }
  /* السحب الأفقي على اللمس: إلى اليمين = التالي (اتجاه القراءة العربية) */
  const touch = useRef<number | null>(null)
  const fullscreen = () => {
    const el = box.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else el.requestFullscreen?.().catch(() => {})
  }

  return (
    <div className={v.wrap}>
      <div ref={box} className={v.viewer} tabIndex={0} role="region" aria-roledescription="عارض شرائح" aria-label="السلايدات — استعمل الأسهم للتقليب" onKeyDown={onKey}
        onTouchStart={(e) => { touch.current = e.touches[0]?.clientX ?? null }}
        onTouchEnd={(e) => {
          const x0 = touch.current, x1 = e.changedTouches[0]?.clientX
          touch.current = null
          if (x0 === null || x1 === undefined || Math.abs(x1 - x0) < 48) return
          go(x1 > x0 ? 1 : -1)
        }}>
        <div ref={stage} className={v.stage}>
          {state === 'loading' && <p className={v.status} role="status">جارٍ تحميل السلايدات…</p>}
          {state === 'error' && <p className={v.status} role="alert">تعذّر تحميل السلايدات — حدّث الصفحة أو حاول لاحقاً</p>}
          {state === 'ready' && <canvas key={page} ref={canvas} dir="ltr" className={v.canvas} role="img" aria-label={`الشريحة ${page} من ${total}`} />}
          {p.watermark && (
            <span className={v.wmLayer} aria-hidden="true">
              <span className={v.watermark} style={{ '--x': wm.x, '--y': wm.y } as React.CSSProperties}>{p.watermark}</span>
            </span>
          )}
        </div>
        <div className={v.bar}>
          <button type="button" onClick={() => go(-1)} disabled={page <= 1} aria-label="الشريحة السابقة">→</button>
          <span className={`num ${v.count}`} aria-live="polite"><b>{page}</b> / {total}</span>
          <button type="button" onClick={() => go(1)} disabled={page >= total} aria-label="الشريحة التالية">←</button>
          <span className={v.grow} />
          {p.download && <a href={p.download} download aria-label="تنزيل ملف السلايدات">⇩</a>}
          <button type="button" onClick={fullscreen} aria-label="ملء الشاشة">⛶</button>
        </div>
        <div className={v.track} aria-hidden="true"><i style={{ transform: `scaleX(${page / Math.max(1, total)})` }} /></div>
      </div>
      {done ? <p className={v.done} role="status">✓ اكتمل هذا الدرس</p>
        : p.track && <p className={v.hint}>يكتمل الدرس حين تبلغ الشريحة الأخيرة.</p>}
    </div>
  )
}
