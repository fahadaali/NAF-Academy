'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { MemberRow } from '@/server/db/schema'
import { ROLES, ROLE_HINT, ROLE_LABEL, type Role } from '@/lib/permissions'
import { inviteMember, setMemberActive, setMemberRole } from './actions'
import { Badge, Field, Grid, Input, PageHead, Section, Select } from '@/admin/ui/kit'
import p from '@/admin/ui/panel.module.css'

export function TeamBoard({ members, mode, meId }: { members: MemberRow[]; mode: 'naf-auth' | 'password'; meId: string }) {
  const router = useRouter()
  const [v, setV] = useState({ email: '', name: '', role: 'content' as Role })
  const [msg, setMsg] = useState('')
  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>) => { const r = await fn(); if (!r.ok) setMsg(r.error ?? 'تعذّر'); else { setMsg(''); router.refresh() } }
  return (
    <>
      <PageHead title="الفريق والصلاحيات" sub={mode === 'naf-auth' ? 'الدخول عبر هوية ناف الموحّدة — الدور هنا يحدد ما يراه العضو ويفعله' : 'وضع كلمة المرور المؤقت: الداخل مالك. الأدوار تُطبَّق فور تفعيل الدخول الموحّد (STAFF_AUTH=naf-auth).'} />
      <Section title="الأدوار">
        <Grid>{ROLES.map((r) => <div key={r}><strong>{ROLE_LABEL[r]}</strong><div className={p.muted}>{ROLE_HINT[r]}</div></div>)}</Grid>
      </Section>
      <Section title="دعوة عضو" desc="يدخل ببريده في هوية ناف، فيُربط بهذه الدعوة ويأخذ دورها">
        <Grid cols={3}>
          <Field label="البريد"><Input dir="ltr" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
          <Field label="الاسم"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
          <Field label="الدور"><Select value={v.role} onChange={(x) => setV({ ...v, role: x })} options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} /></Field>
        </Grid>
        <button className="btn" style={{ justifySelf: 'start' }} disabled={!v.email} onClick={() => act(() => inviteMember(v)).then(() => setV({ email: '', name: '', role: 'content' }))}>أرسل الدعوة</button>
      </Section>
      {msg && <p role="alert" style={{ color: 'var(--danger)', fontWeight: 600, marginBlockEnd: 12 }}>{msg}</p>}
      {members.length === 0 ? <div className={p.empty}>لا أعضاء بعد.</div> : (
        <table className={p.table}>
          <thead><tr><th>العضو</th><th>الدور</th><th>الحالة</th><th><span className="sr-only">إجراءات</span></th></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId}>
                <td><strong>{m.displayName || m.email}</strong><div className={p.muted} dir="ltr" style={{ textAlign: 'end' }}>{m.email}</div></td>
                <td>
                  <select aria-label="الدور" className={p.search} style={{ minInlineSize: 0, minBlockSize: 36 }} value={m.role} onChange={(e) => act(() => setMemberRole(m.userId, e.target.value as Role))}>
                    {!(ROLES as readonly string[]).includes(m.role) && <option value={m.role} disabled>بانتظار التفعيل — اختر دوراً</option>}
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </td>
                <td>{m.userId.startsWith('invite:') ? <Badge tone="soon">مدعو — لم يدخل بعد</Badge> : m.isActive ? <Badge tone="open">نشط</Badge> : <Badge tone="draft">موقوف</Badge>}</td>
                <td>{m.userId !== meId && <button className={`${p.iconBtn} ${m.isActive ? p.danger : ''}`} onClick={() => (m.isActive ? confirm(`إيقاف ${m.email}؟ يُبلَّغ المركز فوراً.`) : true) && act(() => setMemberActive(m.userId, !m.isActive))}>{m.isActive ? 'إيقاف' : 'تفعيل'}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
