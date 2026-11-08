'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cancelNotifications, retryNotification, runNow } from './actions'
import p from '@/admin/ui/panel.module.css'

export function RunNow() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  return (
    <span className={p.wrap}>
      {msg && <span role="status" className={p.muted}>{msg}</span>}
      <button className="btn" disabled={busy} onClick={async () => { setBusy(true); const r = await runNow(); setBusy(false); setMsg(r.text); router.refresh() }}>شغّل الجدولة الآن</button>
    </span>
  )
}

export function RowAction({ id, status }: { id: string; status: string }) {
  const router = useRouter()
  if (status === 'pending') return <button className={`${p.iconBtn} ${p.danger}`} onClick={async () => { await cancelNotifications([id]); router.refresh() }}>إلغاء</button>
  if (status === 'failed' || status === 'skipped') return <button className={p.iconBtn} onClick={async () => { await retryNotification(id); router.refresh() }}>أعد المحاولة</button>
  return null
}
