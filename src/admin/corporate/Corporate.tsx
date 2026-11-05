'use client'
/* واجهات المؤسسات في اللوحة: بطاقة طلب بحالة وملاحظات، وإعداد التبليغ، ومحرّر المؤسسة وأعضائها */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addOrgMember, archiveOrganization, organizationFromRequest, removeOrgMember, saveCorporateNotify, saveOrganization, updateRequest } from './actions'
import { Field, Grid, Input, Textarea } from '@/admin/ui/kit'
import p from '@/admin/ui/panel.module.css'
import c from './corporate.module.css'

export const STATUS: Record<string, string> = { new: 'جديد', contacted: 'تواصلنا', proposal: 'عرض مُرسل', won: 'تم التعاقد', lost: 'لم يتم' }

export function RequestCard({ r }: { r: { id: string; name: string; org: string; contact: string; size: string; interests: string[]; status: string; notes: string; when: string; orgId: string | null; message: string } }) {
  const router = useRouter()
  const [status, setStatus] = useState(r.status)
  const [notes, setNotes] = useState(r.notes)
  const [saved, setSaved] = useState('')
  const save = async (st = status) => { await updateRequest(r.id, { status: st, notes }); setSaved('حُفظ'); router.refresh() }
  return (
    <article className={c.card} id={`r-${r.id}`} data-status={status}>
      <div className={c.head}>
        <div><strong>{r.org}</strong><small>{r.name} · <span dir="ltr">{r.contact}</span></small></div>
        <select value={status} aria-label="الحالة" onChange={(e) => { setStatus(e.target.value); void save(e.target.value) }}>
          {Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <div className={c.meta}>
        {r.size && <span className="num">الفريق: {r.size}</span>}
        {r.interests.map((x) => <span key={x} className={c.tag}>{x}</span>)}
        <span className={`${p.muted} num`}>{r.when}</span>
      </div>
      {r.message && <p className={c.message}>«{r.message}»</p>}
      <textarea className={c.notes} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== r.notes && save()} placeholder="ملاحظات المتابعة (تُحفظ عند الخروج من الحقل)" aria-label="ملاحظات" />
      <div className={c.actions}>
        {r.orgId ? <a className={p.iconBtn} href={`/admin/organizations/${r.orgId}`}>حساب المؤسسة ←</a>
          : <button className={p.iconBtn} onClick={async () => { const x = await organizationFromRequest(r.id); if (x.id) router.push(`/admin/organizations/${x.id}`) }}>إنشاء حساب مؤسسة</button>}
        {saved && <span role="status" className={p.muted}>{saved}</span>}
      </div>
    </article>
  )
}

export function NotifyForm({ initial }: { initial: string[] }) {
  const [v, setV] = useState(initial.join(', '))
  const [msg, setMsg] = useState('')
  return (
    <form className={c.notify} onSubmit={async (e) => { e.preventDefault(); const r = await saveCorporateNotify(v); setMsg(r.ok ? 'حُفظ' : r.error ?? '') }}>
      <Input dir="ltr" value={v} onChange={(e) => setV(e.target.value)} placeholder="team@naf.sa, sales@naf.sa" aria-label="من يُبلَّغ بالطلبات الجديدة" />
      <button className="btn ghost">حفظ</button>
      {msg && <span role="status" className={p.muted}>{msg}</span>}
    </form>
  )
}

export function OrgForm({ id, initial }: { id: string | null; initial: { name: string; domains: string[]; notes: string } }) {
  const router = useRouter()
  const [v, setV] = useState({ ...initial, domains: initial.domains.join(', ') })
  const [msg, setMsg] = useState('')
  return (
    <form className={c.org} onSubmit={async (e) => {
      e.preventDefault()
      const r = await saveOrganization(id, { name: v.name, notes: v.notes, domains: v.domains.split(/[,\s،]+/).map((x) => x.trim()).filter(Boolean) })
      if (!r.ok) return setMsg(r.error ?? '')
      setMsg('حُفظ')
      if (!id) router.push(`/admin/organizations/${r.id}`); else router.refresh()
    }}>
      <Grid>
        <Field label="اسم المؤسسة"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required /></Field>
        <Field label="نطاقات البريد" hint="مثل company.sa — يُربط موظفوها تلقائياً، ولا يرى المسؤول إلا الدورات التي رعتها المؤسسة">
          <Input dir="ltr" value={v.domains} onChange={(e) => setV({ ...v, domains: e.target.value })} placeholder="company.sa" />
        </Field>
        <Field label="ملاحظات" wide><Textarea value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
      </Grid>
      <div className={c.actions}>
        <button className="btn">حفظ</button>
        {msg && <span role="status" className={p.muted}>{msg}</span>}
        {id && <button type="button" className={`${p.iconBtn} ${p.danger}`} onClick={async () => { if (confirm('أرشفة المؤسسة؟')) { await archiveOrganization(id); router.push('/admin/organizations') } }}>أرشفة</button>}
      </div>
    </form>
  )
}

export function MemberForm({ orgId }: { orgId: string }) {
  const router = useRouter()
  const [msg, setMsg] = useState('')
  return (
    <form className={c.notify} onSubmit={async (e) => {
      e.preventDefault()
      const f = new FormData(e.currentTarget)
      const r = await addOrgMember(orgId, { email: String(f.get('email')), name: String(f.get('name')), role: f.get('role') === 'manager' ? 'manager' : 'member' })
      setMsg(r.ok ? 'أُضيف' : r.error ?? '')
      if (r.ok) { (e.target as HTMLFormElement).reset(); router.refresh() }
    }}>
      <Input name="email" dir="ltr" placeholder="البريد" aria-label="بريد العضو" required />
      <Input name="name" placeholder="الاسم (اختياري)" aria-label="اسم العضو" />
      <select name="role" aria-label="الدور" className={c.select}><option value="manager">مسؤول</option><option value="member">عضو</option></select>
      <button className="btn ghost">إضافة</button>
      {msg && <span role="status" className={p.muted}>{msg}</span>}
    </form>
  )
}

export function RemoveMember({ orgId, learnerId }: { orgId: string; learnerId: string }) {
  const router = useRouter()
  return <button className={`${p.iconBtn} ${p.danger}`} onClick={async () => { await removeOrgMember(orgId, learnerId); router.refresh() }}>إزالة</button>
}
