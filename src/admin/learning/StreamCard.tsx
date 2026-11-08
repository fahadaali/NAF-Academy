'use client'
/* Cloudflare Stream في اللوحة: حالة الربط، وإشعار اكتمال المعالجة (يُسجَّل بزر — سرّه يحفظه الخادم ولا يُعرض)، وآخر الفيديوهات بحالتها.
   تُحدَّث القائمة دورياً ما دام فيها ما يُعالج. */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { enableStreamWebhook } from './actions'
import { useCan } from '@/admin/ui/perms'
import { timing } from '@/motion/tokens'
import p from '@/admin/ui/panel.module.css'
import u from '@/admin/courses/stream.module.css'

type Row = { uid: string; name: string; status: string; pct: number; durationSeconds: number | null; error: string; lessonTitle: string | null }
const LABEL: Record<string, string> = { pending: 'بانتظار الرفع', processing: 'قيد المعالجة', ready: 'جاهز', error: 'خطأ' }
const mins = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '')

export function StreamCard({ configured, problem, hook, videos, busy }: { configured: boolean; problem?: string; hook: { on: boolean; at: string | null; fromEnv: boolean }; videos: Row[]; busy: boolean }) {
  const router = useRouter()
  const can = useCan()('channels.manage')
  const [msg, setMsg] = useState('')
  const [wait, setWait] = useState(false)
  /* ما دام فيديو قيد المعالجة: تحديث الصفحة دورياً (المشغّل الدوري وWebhook يحدّثان القاعدة) */
  useEffect(() => {
    if (!busy) return
    const id = setInterval(() => { if (document.visibilityState === 'visible') router.refresh() }, timing.streamPoll)
    return () => clearInterval(id)
  }, [busy, router])
  return (
    <div className={`${p.card} ${u.card}`}>
      <strong>Cloudflare Stream — الدورات المسجّلة</strong>
      {!configured ? <span className={p.muted}>مقفل — {problem}.</span> : (
        <>
          <span className={p.muted}>
            {hook.on
              ? `إشعار اكتمال المعالجة مفعّل${hook.fromEnv ? ' (من أسرار البيئة)' : ''} — تتحدّث حالة الفيديو فور جاهزيته.`
              : 'إشعار اكتمال المعالجة غير مفعّل — تتحدّث الحالة بالسؤال كل 5 دقائق. فعّله لتصل فوراً.'}
          </span>
          {can && !hook.fromEnv && (
            <button type="button" className={`btn ghost ${u.start}`} disabled={wait}
              onClick={async () => { setWait(true); setMsg(''); const r = await enableStreamWebhook(); setWait(false); if (!r.ok) setMsg(r.error ?? ''); else router.refresh() }}>
              {wait ? 'جارٍ التسجيل…' : hook.on ? 'إعادة تسجيل الإشعار' : 'تفعيل إشعار Stream'}
            </button>
          )}
          {videos.length > 0 && (
            <div className={p.scroll}><table className={p.table}>
              <thead><tr><th>الفيديو</th><th>الدرس</th><th>الحالة</th><th>المدة</th></tr></thead>
              <tbody>{videos.map((v) => (
                <tr key={v.uid}>
                  <td>{v.name || '—'}</td>
                  <td>{v.lessonTitle ?? '—'}</td>
                  <td><span className={u.badge} data-state={v.status}><i aria-hidden="true" />{LABEL[v.status] ?? v.status}{v.status === 'processing' && v.pct ? <span className="num"> {v.pct}%</span> : null}</span>{v.error && <div className={p.muted}>{v.error}</div>}</td>
                  <td className="num">{mins(v.durationSeconds)}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </>
      )}
      {msg && <span role="alert" className={u.alert}>{msg}</span>}
    </div>
  )
}
