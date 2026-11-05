'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { assignOrgSeat } from '@/site/org-actions'
import st from './learn.module.css'

export function OrgSeat({ orgId, grantId }: { orgId: string; grantId: string }) {
  const router = useRouter()
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <form className={st.seat} onSubmit={async (e) => {
      e.preventDefault()
      const f = new FormData(e.currentTarget)
      setBusy(true); setMsg('')
      const r = await assignOrgSeat(orgId, grantId, String(f.get('email')), String(f.get('name')))
      setBusy(false)
      if (r.ok) router.refresh(); else setMsg(r.error ?? 'تعذّر')
    }}>
      <input name="email" type="email" dir="ltr" required placeholder="بريد الموظف" aria-label="بريد الموظف" />
      <input name="name" placeholder="الاسم" aria-label="اسم الموظف" />
      <button className="btn ghost" disabled={busy}>خصّص</button>
      {msg && <span role="alert">{msg}</span>}
    </form>
  )
}
