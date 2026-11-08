'use client'
/* رفع فيديو إلى Cloudflare Stream من اللوحة — شريط تقدّم (النسبة والسرعة والمتبقي) وإلغاء، طلب واحد للملف الصغير وtus يستأنف للكبير،
   ثم مؤشر المعالجة يُسأل عنه دورياً حتى «جاهز». الخادم يعطي رابط الرفع وحده؛ الملف لا يمرّ بخادمنا. */
import { useEffect, useRef, useState } from 'react'
import { streamUpload, streamVideoStatus } from '@/admin/learning/actions'
import { basicUpload, tusUpload, type Progress } from '@/lib/tus'
import { timing } from '@/motion/tokens'
import { fileSize } from '@/lib/files'
import u from './stream.module.css'

type Status = { status: string; pct: number; durationSeconds: number | null; error: string }
const LABEL: Record<string, string> = { pending: 'بانتظار الرفع', processing: 'قيد المعالجة', ready: 'جاهز للعرض', error: 'تعذّرت المعالجة' }
const clock = (sec: number) => { const x = Math.max(0, Math.round(sec)); const h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60), s = x % 60; return `${h ? `${h}:` : ''}${h ? String(m).padStart(2, '0') : m}:${String(s).padStart(2, '0')}` }
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export function StreamUpload({ uid, lessonId, disabled, onUploaded }: { uid: string; lessonId?: string | null; disabled?: boolean; onUploaded: (uid: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController | null>(null)
  const started = useRef(0)
  const [prog, setProg] = useState<(Progress & { name: string }) | null>(null)
  const [msg, setMsg] = useState('')
  const [st, setSt] = useState<Status | null>(null)

  /* مؤشر المعالجة: يُسأل عنه فور ظهور المعرّف ثم دورياً ما دام لم يكتمل (والصفحة ظاهرة) */
  useEffect(() => {
    setSt(null)
    if (!/^[a-f0-9]{32}$/.test(uid)) return
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const ask = async () => {
      if (document.visibilityState === 'visible') {
        const r = await streamVideoStatus(uid).catch(() => null)
        if (!live) return
        if (r?.ok) { setSt(r); if (r.status === 'ready' || r.status === 'error') return }
      }
      timer = setTimeout(ask, timing.streamPoll)
    }
    void ask()
    return () => { live = false; clearTimeout(timer) }
  }, [uid])

  const upload = async (f: File) => {
    setMsg('')
    if (!f.type.startsWith('video/')) { setMsg('اختر ملف فيديو'); return }
    const r = await streamUpload({ lessonId: lessonId ?? null, name: f.name, size: f.size })
    if (!r.ok) { setMsg(r.error); return }
    const ctl = new AbortController()
    abort.current = ctl
    started.current = performance.now()
    setProg({ sent: 0, total: f.size, name: f.name })
    const on = (p: Progress) => setProg({ ...p, name: f.name })
    try {
      if (r.method === 'tus') await tusUpload(r.uploadURL, f, on, ctl.signal, (n) => wait(timing.uploadRetry * n))
      else await basicUpload(r.uploadURL, f, on, ctl.signal)
      onUploaded(r.uid)
      setMsg('رُفع — احفظ الدورة ليُعتمد الفيديو في الدرس.')
    } catch (e) {
      setMsg((e as Error).name === 'AbortError' ? 'أُلغي الرفع.' : 'تعذّر الرفع — تحقق من الاتصال وأعد المحاولة.')
    } finally {
      abort.current = null
      setProg(null)
      if (input.current) input.current.value = ''
    }
  }

  const pct = prog ? Math.min(100, (prog.sent / Math.max(1, prog.total)) * 100) : 0
  const secs = prog ? (performance.now() - started.current) / 1000 : 0
  const rate = prog && secs > 1 ? prog.sent / secs : 0
  const left = rate > 0 && prog ? (prog.total - prog.sent) / rate : null

  return (
    <div className={u.box}>
      <input ref={input} type="file" accept="video/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      {!prog && (
        <button type="button" className="btn ghost" onClick={() => input.current?.click()} disabled={disabled} aria-disabled={disabled}>
          {uid ? 'استبدال الفيديو' : 'رفع فيديو'}
        </button>
      )}
      {prog && (
        <div className={u.progress} role="group" aria-label="رفع الفيديو">
          <div className={u.head}>
            <span className={u.name}>{prog.name}</span>
            <button type="button" className={u.cancel} onClick={() => abort.current?.abort()}>إلغاء</button>
          </div>
          <div className={u.track} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="نسبة الرفع">
            <span className={u.fill} style={{ ['--p' as string]: pct / 100 }} />
          </div>
          <div className={`${u.meta} num`}>
            <span>{Math.floor(pct)}% · {fileSize(prog.sent)} من {fileSize(prog.total)}</span>
            <span dir="ltr">{rate ? `${fileSize(rate)}/s` : '…'}{left !== null ? ` · ${clock(left)}` : ''}</span>
          </div>
        </div>
      )}
      {st && !prog && (
        <span className={u.badge} data-state={st.status} role="status">
          <i aria-hidden="true" />
          {LABEL[st.status] ?? st.status}
          {st.status === 'processing' && st.pct > 0 && <span className="num"> {st.pct}%</span>}
          {st.status === 'ready' && st.durationSeconds ? <span className="num"> · {clock(st.durationSeconds)}</span> : null}
          {st.status === 'error' && st.error ? <span> — {st.error}</span> : null}
        </span>
      )}
      {msg && <span className={u.note} role="status">{msg}</span>}
    </div>
  )
}
