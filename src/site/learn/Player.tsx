'use client'
/* المشغّل — واجهة واحدة لمصدرين: Cloudflare Stream (iframe + SDK) ورابط فيديو مباشر (<video>).
   الاستكمال من حيث توقّف، والفصول، والسرعة، ووضع المسرح، وعلامة مائية متنقلة باسم المتدرب،
   واختصارات لوحة المفاتيح، ونبضات تقدّم لا تحتسب إلا ما شوهد فعلاً. */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { Chapter } from '@/lib/learning-types'
import s from './player.module.css'

export type PlayerApi = { time: () => number; seek: (t: number) => void; pause: () => void }

type Props = {
  kind: 'stream' | 'url'
  src: string
  resumeAt: number
  chapters: Chapter[]
  /** ترجمات الفيديو المباشر — Stream يعرض ترجماته في مشغّله */
  captions?: { src: string; lang: string; label: string }[]
  watermark: string
  onBeat: (position: number, delta: number, duration: number) => void
  theater: boolean
  onTheater: (v: boolean) => void
}

type StreamEl = HTMLIFrameElement & { __sdk?: StreamSdk }
type StreamSdk = { currentTime: number; duration: number; paused: boolean; playbackRate: number; play(): void; pause(): void; addEventListener(e: string, f: () => void): void }
declare global { interface Window { Stream?: (el: HTMLIFrameElement) => StreamSdk } }

const fmt = (t: number) => {
  const x = Math.max(0, Math.floor(t))
  const h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60), sec = x % 60
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(sec).padStart(2, '0')}`
}
const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2]

export const Player = forwardRef<PlayerApi, Props>(function Player({ kind, src, resumeAt, chapters, captions = [], watermark, onBeat, theater, onTheater }, ref) {
  const video = useRef<HTMLVideoElement>(null)
  const frame = useRef<StreamEl>(null)
  const sdk = useRef<StreamSdk | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const [t, setT] = useState(resumeAt)
  const [dur, setDur] = useState(0)
  const [paused, setPaused] = useState(true)
  const [rate, setRate] = useState(1)
  const [wm, setWm] = useState({ x: 8, y: 10 })
  const [hint, setHint] = useState('')
  /* الترجمة: اللغة المختارة تُحفظ لهذا المتصفح */
  const [cc, setCc] = useState<string>('')
  useEffect(() => { try { const v = localStorage.getItem('naf-cc'); if (v && captions.some((c) => c.lang === v)) setCc(v) } catch {} }, [captions])
  useEffect(() => {
    const tracks = video.current?.textTracks
    if (!tracks) return
    for (const t of Array.from(tracks)) t.mode = t.language === cc ? 'showing' : 'hidden'
    try { localStorage.setItem('naf-cc', cc) } catch {}
  }, [cc])
  const watched = useRef(0)
  const lastT = useRef(resumeAt)

  const now = useCallback(() => (kind === 'url' ? video.current?.currentTime ?? 0 : sdk.current?.currentTime ?? 0), [kind])
  const seek = useCallback((x: number) => {
    if (kind === 'url' && video.current) video.current.currentTime = x
    if (kind === 'stream' && sdk.current) sdk.current.currentTime = x
    lastT.current = x
  }, [kind])
  const toggle = useCallback(() => {
    const p = kind === 'url' ? video.current : sdk.current
    if (!p) return
    if (p.paused) void p.play(); else p.pause()
  }, [kind])
  useImperativeHandle(ref, () => ({ time: now, seek, pause: () => (kind === 'url' ? video.current?.pause() : sdk.current?.pause()) }), [now, seek, kind])

  /* Stream SDK */
  useEffect(() => {
    if (kind !== 'stream') return
    const attach = () => {
      if (!frame.current || !window.Stream) return
      const p = window.Stream(frame.current)
      sdk.current = p
      p.addEventListener('timeupdate', () => setT(p.currentTime))
      p.addEventListener('durationchange', () => setDur(p.duration))
      p.addEventListener('loadedmetadata', () => setDur(p.duration))
      p.addEventListener('play', () => setPaused(false))
      p.addEventListener('pause', () => setPaused(true))
    }
    if (window.Stream) { attach(); return }
    const js = document.createElement('script')
    js.src = 'https://embed.cloudflarestream.com/embed/sdk.latest.js'
    js.onload = attach
    document.body.appendChild(js)
    return () => { js.remove() }
  }, [kind, src])

  /* نبضة كل 10 ثوانٍ: ما شوهد فعلاً منذ آخر نبضة (القفز لا يُحتسب) */
  useEffect(() => {
    const tick = setInterval(() => {
      const cur = now()
      const d = cur - lastT.current
      /* ثوانٍ من المحتوى شوهدت فعلاً (القفز أكثر من 15 ثانية لا يُحتسب) */
      if (!paused && d > 0 && d < 15) watched.current += d
      lastT.current = cur
    }, 1000)
    const beat = setInterval(() => {
      const add = Math.round(watched.current)
      watched.current -= add
      if (add > 0 || !paused) onBeat(now(), add, dur)
    }, 10_000)
    return () => { clearInterval(tick); clearInterval(beat) }
  }, [now, paused, dur, onBeat])

  /* العلامة المائية تتنقل كل 20 ثانية */
  useEffect(() => {
    const id = setInterval(() => setWm({ x: 5 + Math.random() * 60, y: 6 + Math.random() * 75 }), 20_000)
    return () => clearInterval(id)
  }, [])

  /* حفظ الموضع عند المغادرة */
  useEffect(() => {
    const out = () => onBeat(now(), Math.round(watched.current), dur)
    addEventListener('pagehide', out)
    return () => removeEventListener('pagehide', out)
  }, [now, dur, onBeat])

  const flash = (h: string) => { setHint(h); setTimeout(() => setHint(''), 700) }
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, textarea')) return
    const k = e.key.toLowerCase()
    if (k === ' ' || k === 'k') { e.preventDefault(); toggle(); flash(paused ? '▶' : '❚❚') }
    else if (k === 'arrowright' || k === 'l') { e.preventDefault(); seek(now() + 10); flash('+10') }
    else if (k === 'arrowleft' || k === 'j') { e.preventDefault(); seek(Math.max(0, now() - 10)); flash('−10') }
    else if (k === 't') onTheater(!theater)
    else if (k === 'f') { if (document.fullscreenElement) void document.exitFullscreen(); else void box.current?.requestFullscreen() }
    else if (k === 'm' && video.current) { video.current.muted = !video.current.muted; flash(video.current.muted ? '🔇' : '🔊') }
  }
  const setSpeed = (r: number) => {
    setRate(r)
    if (video.current) video.current.playbackRate = r
    if (sdk.current) sdk.current.playbackRate = r
  }

  const pct = dur ? (t / dur) * 100 : 0
  return (
    <div ref={box} className={s.player} tabIndex={0} onKeyDown={onKey} role="region" aria-label="مشغّل الدرس — مسافة للتشغيل، والأسهم للتقديم والتأخير، T لوضع المسرح">
      <div className={s.stage}>
        {kind === 'url' ? (
          <video
            ref={video}
            src={src}
            className={s.media}
            playsInline
            preload="metadata"
            controlsList="nodownload"
            onContextMenu={(e) => e.preventDefault()}
            onLoadedMetadata={(e) => { setDur(e.currentTarget.duration); if (resumeAt > 3) e.currentTarget.currentTime = resumeAt }}
            onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
            onPlay={() => setPaused(false)}
            onPause={() => setPaused(true)}
            onClick={toggle}
          >
            {captions.map((c) => <track key={c.lang} kind="subtitles" src={c.src} srcLang={c.lang} label={c.label} />)}
          </video>
        ) : (
          <iframe ref={frame} src={src} className={s.media} allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen title="فيديو الدرس" />
        )}
        <span className={s.wmLayer} aria-hidden="true"><span className={s.watermark} style={{ ['--x' as string]: wm.x, ['--y' as string]: wm.y }}>{watermark}</span></span>
        {hint && <span className={s.hint} aria-hidden="true">{hint}</span>}
        {kind === 'url' && paused && <button className={s.big} onClick={toggle} aria-label="تشغيل">▶</button>}
      </div>

      {kind === 'url' && (
        <div className={s.bar} dir="ltr">
          <button onClick={toggle} aria-label={paused ? 'تشغيل' : 'إيقاف مؤقت'}>{paused ? '▶' : '❚❚'}</button>
          <span className={`${s.time} num`}>{fmt(t)} / {fmt(dur)}</span>
          <div className={s.track}>
            <input type="range" min={0} max={dur || 1} step={1} value={t} onChange={(e) => seek(Number(e.target.value))} aria-label="الموضع" style={{ ['--p' as string]: `${pct}%` }} />
            {dur > 0 && chapters.map((c) => <i key={c.at} className={s.mark} style={{ left: `${(c.at / dur) * 100}%` }} title={c.title} />)}
          </div>
          {captions.length > 0 && (
            <select value={cc} onChange={(e) => setCc(e.target.value)} aria-label="الترجمة النصية">
              <option value="">CC ✕</option>
              {captions.map((c) => <option key={c.lang} value={c.lang}>CC {c.label}</option>)}
            </select>
          )}
          <select value={rate} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="السرعة">
            {SPEEDS.map((r) => <option key={r} value={r}>{r}×</option>)}
          </select>
          <button onClick={() => onTheater(!theater)} aria-label="وضع المسرح" aria-pressed={theater}>⛶</button>
        </div>
      )}
      {kind === 'stream' && (
        <div className={s.bar} dir="ltr">
          <span className={`${s.time} num`}>{fmt(t)} / {fmt(dur)}</span>
          <span style={{ flex: 1 }} />
          <select value={rate} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="السرعة">
            {SPEEDS.map((r) => <option key={r} value={r}>{r}×</option>)}
          </select>
          <button onClick={() => onTheater(!theater)} aria-label="وضع المسرح" aria-pressed={theater}>⛶</button>
        </div>
      )}
    </div>
  )
})

export { fmt as formatTime }
