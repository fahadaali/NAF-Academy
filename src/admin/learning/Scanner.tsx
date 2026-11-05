'use client'
/* ماسح تذاكر الحضور — كاميرا المتصفح (BarcodeDetector) حيث تتوفر، وإلا يفتح موظف الباب الرمز بكاميرا الجوال
   فيصل إلى هذه الصفحة بالتذكرة ويؤكّد بلمسة. التأكيد بلمسة دائماً — لا يُسجَّل حضور بمجرد فتح رابط. */
import { useEffect, useRef, useState } from 'react'
import { checkIn, type CheckIn } from './actions'
import r from './review.module.css'

type Detector = { detect(src: HTMLVideoElement): Promise<{ rawValue: string }[]> }
declare global { interface Window { BarcodeDetector?: new (o: { formats: string[] }) => Detector } }

const tokenOf = (raw: string) => {
  try { return new URL(raw).searchParams.get('t') ?? raw } catch { return raw }
}

export function Scanner({ initial }: { initial: string }) {
  const [pending, setPending] = useState(initial)
  const [res, setRes] = useState<CheckIn | null>(null)
  const [busy, setBusy] = useState(false)
  const [cam, setCam] = useState<'off' | 'on' | 'unsupported'>('off')
  const video = useRef<HTMLVideoElement>(null)
  const last = useRef('')

  const confirm = async (t: string) => {
    setBusy(true)
    const out = await checkIn(t)
    setBusy(false)
    setRes(out)
    setPending('')
    if (initial) history.replaceState(null, '', '/admin/checkin')
  }

  useEffect(() => {
    if (cam !== 'on') return
    let stream: MediaStream | null = null
    let stop = false
    const det = new window.BarcodeDetector!({ formats: ['qr_code'] })
    ;(async () => {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      if (!video.current) return
      video.current.srcObject = stream
      await video.current.play()
      while (!stop) {
        const found = await det.detect(video.current).catch(() => [])
        const t = found[0] ? tokenOf(found[0].rawValue) : ''
        if (t && t !== last.current) { last.current = t; await confirm(t) }
        await new Promise((ok) => setTimeout(ok, 350))
      }
    })().catch(() => setCam('unsupported'))
    return () => { stop = true; stream?.getTracks().forEach((x) => x.stop()) }
  }, [cam])

  return (
    <div className={r.scan}>
      {pending && (
        <div className={r.card}>
          <strong>تذكرة جاهزة للتأكيد</strong>
          <button className="btn" disabled={busy} onClick={() => confirm(pending)}>سجّل الحضور</button>
        </div>
      )}
      {res && (
        <div className={r.result} data-ok={res.ok ? '1' : '0'} role="status" aria-live="polite">
          {res.ok ? (
            <>
              <strong>{res.already ? 'سُجّل حضوره من قبل' : '✓ سُجّل الحضور'}</strong>
              <span>{res.name || res.email}</span>
              <span>{res.course} · {res.lesson}</span>
              {res.when && <span className="num">{res.when}</span>}
            </>
          ) : <strong>{res.error}</strong>}
        </div>
      )}
      {cam === 'on' ? <video ref={video} className={r.video} muted playsInline aria-label="الكاميرا" />
        : cam === 'unsupported' ? <p className={r.meta}>المتصفح لا يدعم المسح المباشر — امسح الرمز بكاميرا الجوال فتُفتح هذه الصفحة بالتذكرة.</p>
        : <button className="btn ghost" onClick={() => setCam(typeof window !== 'undefined' && window.BarcodeDetector ? 'on' : 'unsupported')}>تشغيل الكاميرا</button>}
      <form className={r.actions} onSubmit={(e) => { e.preventDefault(); const t = tokenOf(String(new FormData(e.currentTarget).get('t') ?? '')); if (t) void confirm(t) }}>
        <input name="t" className={r.text} style={{ minBlockSize: 44, flex: 1 }} dir="ltr" placeholder="أو الصق رابط التذكرة" aria-label="رابط التذكرة" />
        <button className="btn ghost" disabled={busy}>تحقّق</button>
      </form>
    </div>
  )
}
