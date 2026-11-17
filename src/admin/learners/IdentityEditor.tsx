'use client'
/* تصحيح هوية المتدرب — للفريق بصلاحية learners.identity وحده (الصفحة لا تعرضه لغيره ولا تمرّر له الرقم كاملاً) */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Field, Grid, Input } from '@/admin/ui/kit'
import { setLearnerIdentity } from './identity-actions'
import p from '@/admin/ui/panel.module.css'

export function IdentityEditor({ id, initial }: { id: string; initial: { name: string; nameEn: string; nationalId: string; phone: string } }) {
  const router = useRouter()
  const [v, setV] = useState({ ...initial, reason: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => { setV({ ...v, [k]: e.target.value }); setMsg(null) }
  return (
    <div className={p.stack}>
      <Grid>
        <Field label="الاسم بالعربية"><Input value={v.name} onChange={set('name')} /></Field>
        <Field label="الاسم بالإنجليزية"><Input dir="ltr" value={v.nameEn} onChange={set('nameEn')} /></Field>
        <Field label="رقم الهوية أو الإقامة"><Input dir="ltr" inputMode="numeric" autoComplete="off" value={v.nationalId} onChange={set('nationalId')} /></Field>
        <Field label="الجوال"><Input dir="ltr" inputMode="tel" value={v.phone} onChange={set('phone')} /></Field>
      </Grid>
      <Field label="سبب التصحيح" hint="يُحفظ في سجل التعديلات"><Input value={v.reason} onChange={set('reason')} /></Field>
      <div className={p.toolbar}>
        <button type="button" className="btn" disabled={busy} onClick={async () => {
          setBusy(true)
          const r = await setLearnerIdentity({ id, ...v })
          setBusy(false)
          setMsg(r.ok ? { ok: true, t: 'حُفظت الهوية' } : { ok: false, t: r.error ?? 'تعذّر الحفظ' })
          if (r.ok) { setV((o) => ({ ...o, reason: '' })); router.refresh() }
        }}>حفظ التصحيح</button>
        {msg && <span role="status" className={msg.ok ? p.muted : p.err}>{msg.t}</span>}
      </div>
    </div>
  )
}
