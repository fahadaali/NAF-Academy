'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { unsuppress } from './suppressions'
import p from '@/admin/ui/panel.module.css'

export function Unsuppress({ email }: { email: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <button type="button" className={p.iconBtn} disabled={busy} onClick={async () => {
      if (!confirm(`رفع الكتم عن ${email}؟ تأكد أن العنوان صحيح الآن — وإلا ارتدّ البريد من جديد`)) return
      setBusy(true)
      const r = await unsuppress(email)
      setBusy(false)
      if (!r.ok) alert(r.error)
      else router.refresh()
    }}>{busy ? '…' : 'رفع الكتم'}</button>
  )
}
