'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setZoom } from './actions'
import { Switch } from '@/admin/ui/kit'
import { useCan } from '@/admin/ui/perms'
import p from '@/admin/ui/panel.module.css'

/** حالة Zoom: مقفل بلا سرّ الإشعارات، وإلا مفتاح التفعيل — مع رابط الإشعارات لنسخه في تطبيق Zoom */
export function ZoomCard({ configured, enabled, problem, hook }: { configured: boolean; enabled: boolean; problem?: string; hook: string }) {
  const router = useRouter()
  const can = useCan()('channels.manage')
  const [msg, setMsg] = useState('')
  return (
    <div className={p.card} style={{ display: 'grid', gap: 8, marginBlockEnd: 18 }}>
      <strong>تسجيلات Zoom التلقائية</strong>
      {!configured ? <span className={p.muted}>مقفل — {problem}. أنشئ تطبيق Webhook في Zoom بحدث «Recording Completed»، وأضف سرّه إلى البيئة.</span> : (
        <>
          <span className={p.muted}>رابط الإشعارات في تطبيق Zoom: <code dir="ltr">{hook}</code> — يُلحق كل تسجيل بجلسته (الدرس أو جلسة الدفعة) برقم الاجتماع في رابط الانضمام، ويُبلَّغ المسجّلون.</span>
          {can && <Switch checked={enabled} onChange={async (x) => { const r = await setZoom(x); if (!r.ok) setMsg(r.error ?? ''); else router.refresh() }} label={enabled ? 'مفعّل' : 'موقوف'} />}
        </>
      )}
      {msg && <span role="alert" style={{ color: 'var(--danger)' }}>{msg}</span>}
    </div>
  )
}
