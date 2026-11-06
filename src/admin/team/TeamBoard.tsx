'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ROLES, ROLE_HINT, ROLE_LABEL, type Role } from '@/lib/permissions'
import { inviteMember, memberPasswordLink, resetMemberTwoStep, setMemberActive, setMemberInstructor, setMemberRole, type LinkResult } from './actions'
import { PermsDialog } from './PermsDialog'
import { Badge, Field, Grid, Input, PageHead, Section, Select } from '@/admin/ui/kit'
import p from '@/admin/ui/panel.module.css'
import t from './team.module.css'

/** ما يصل إلى المتصفح من صفّ العضو — لا تجزيء ولا أسرار */
export type TeamMember = {
  userId: string; email: string | null; displayName: string | null; role: string; perms: string | null; isActive: boolean
  instructorId: string | null; hasPassword: boolean; totp: boolean; lastSeenAt: number | null; locked: boolean
}

const seen = (sec: number | null) => sec ? new Intl.DateTimeFormat('ar-SA-u-nu-latn', { dateStyle: 'medium', timeZone: 'Asia/Riyadh' }).format(sec * 1000) : '—'

export function TeamBoard({ members, meId, meOwner, instructors = [], mail }: { members: TeamMember[]; meId: string; meOwner: boolean; instructors?: { id: string; name: string }[]; mail: boolean }) {
  const router = useRouter()
  const [v, setV] = useState({ email: '', name: '', role: 'content' as Role })
  const [msg, setMsg] = useState('')
  /* آخر رابط صدر: يُعرض للنسخ (البريد قد لا يكون مربوطاً) */
  const [link, setLink] = useState<{ who: string; url: string; kind: 'invite' | 'reset'; mailed?: boolean } | null>(null)
  const [copied, setCopied] = useState(false)
  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>) => { const r = await fn(); if (!r.ok) setMsg(r.error ?? 'تعذّر'); else { setMsg(''); router.refresh() }; return r }
  const showLink = (who: string, kind: 'invite' | 'reset', r: LinkResult) => { if (r.ok && r.link) { setLink({ who, url: r.link, kind, mailed: r.mailed }); setCopied(false) } }
  const roles = ROLES.filter((r) => meOwner || r !== 'owner')

  return (
    <>
      <PageHead title="الفريق والصلاحيات" sub="حسابات مستقلة للوحة: لكل عضو بريده وكلمة مروره ودوره. الدخول من صفحة دخول اللوحة على أي جهاز." />
      <Section title="الأدوار">
        <Grid>{ROLES.map((r) => <div key={r}><strong>{ROLE_LABEL[r]}</strong><div className={p.muted}>{ROLE_HINT[r]}</div></div>)}</Grid>
      </Section>
      <Section title="دعوة عضو" desc={mail ? 'يصله بريد برابط يعيّن منه كلمة مروره (صالح ثلاثة أيام)، ويظهر الرابط هنا أيضاً للنسخ.' : 'البريد غير مربوط بعد: يظهر رابط الدعوة هنا فانسخه وأرسله للعضو بنفسك (صالح ثلاثة أيام).'}>
        <Grid cols={3}>
          <Field label="البريد"><Input dir="ltr" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
          <Field label="الاسم"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
          <Field label="الدور"><Select value={v.role} onChange={(x) => setV({ ...v, role: x })} options={roles.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} /></Field>
        </Grid>
        <button className={`btn ${t.start}`} disabled={!v.email} onClick={async () => {
          const r = await act(() => inviteMember(v)) as LinkResult
          showLink(v.email, 'invite', r)
          if (r.ok) setV({ email: '', name: '', role: 'content' })
        }}>دعوة</button>
      </Section>

      {link && (
        <div className={t.link} role="status">
          <strong>{link.kind === 'invite' ? `رابط دعوة ${link.who}` : `رابط إعادة تعيين كلمة مرور ${link.who}`}</strong>
          <span className={p.muted}>{link.mailed ? 'أُرسل بالبريد أيضاً. ' : ''}{link.kind === 'invite' ? 'صالح ثلاثة أيام' : 'صالح ساعتين'} ولمرة واحدة — أرسله للعضو وحده.</span>
          <div className={t.linkRow}>
            <input readOnly dir="ltr" value={link.url} className={`${p.search} ${t.linkInput}`} aria-label="الرابط" onFocus={(e) => e.currentTarget.select()} />
            <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(link.url); setCopied(true) } catch { setCopied(false) } }}>{copied ? 'نُسخ' : 'نسخ'}</button>
            <button className="btn ghost" onClick={() => setLink(null)}>إخفاء</button>
          </div>
        </div>
      )}

      {msg && <p role="alert" className={t.err}>{msg}</p>}
      {members.length === 0 ? <div className={p.empty}>لا أعضاء بعد.</div> : (
        <div className={p.scroll}><table className={p.table}>
          <thead><tr><th>العضو</th><th>الدور</th><th>الحالة</th><th>التحقق الثنائي</th><th>الصلاحيات</th><th><span className="sr-only">إجراءات</span></th></tr></thead>
          <tbody>
            {members.map((m) => {
              const ownerLocked = m.role === 'owner' && !meOwner
              const who = m.displayName || m.email || ''
              return (
                <tr key={m.userId}>
                  <td><strong>{who}</strong><div className={`${p.muted} ${p.ltr}`}>{m.email}</div><div className={p.muted}>آخر دخول: {seen(m.lastSeenAt)}</div></td>
                  <td>
                    <select aria-label="الدور" className={`${p.search} ${t.role}`} value={m.role} disabled={ownerLocked} onChange={(e) => act(() => setMemberRole(m.userId, e.target.value as Role))}>
                      {!(ROLES as readonly string[]).includes(m.role) && <option value={m.role} disabled>بلا دور — اختر دوراً</option>}
                      {(ownerLocked ? ROLES : roles).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                    {m.role === 'instructor' && (
                      <select aria-label="ملف المدرب" className={`${p.select} ${t.instructor}`} value={m.instructorId ?? ''} onChange={(e) => act(() => setMemberInstructor(m.userId, e.target.value || null))}>
                        <option value="">— اربطه بملف مدرب ليرى دوراته —</option>
                        {instructors.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </select>
                    )}
                  </td>
                  <td>
                    {!m.isActive ? <Badge tone="draft">موقوف</Badge> : !m.hasPassword ? <Badge tone="soon">مدعو — لم يعيّن كلمة مروره</Badge> : <Badge tone="open">نشط</Badge>}
                    {m.locked && <div className={t.warn}>مقفل مؤقتاً بعد محاولات خاطئة</div>}
                  </td>
                  <td>{m.totp ? <Badge tone="open">مفعّل</Badge> : <span className={p.muted}>—</span>}</td>
                  <td>{m.role === 'owner' ? <span className={p.muted}>كاملة</span> : <PermsDialog userId={m.userId} role={m.role} perms={m.perms} name={who} onDone={() => router.refresh()} />}</td>
                  <td>
                    {!ownerLocked && m.isActive && (
                      <div className={t.tools}>
                        <button className={p.iconBtn} onClick={async () => showLink(who, m.hasPassword ? 'reset' : 'invite', await act(() => memberPasswordLink(m.userId)) as LinkResult)}>
                          {m.hasPassword ? 'رابط إعادة تعيين' : 'رابط الدعوة'}
                        </button>
                        {m.totp && m.userId !== meId && (
                          <button className={p.iconBtn} onClick={() => confirm(`إلغاء التحقق الثنائي لـ ${who}؟ يُخرج من أجهزته ويدخل بكلمة المرور وحدها حتى يفعّله من جديد.`) && act(() => resetMemberTwoStep(m.userId))}>إلغاء التحقق الثنائي</button>
                        )}
                      </div>
                    )}
                    {m.userId !== meId && !ownerLocked && (
                      <button className={`${p.iconBtn} ${m.isActive ? p.danger : ''}`} onClick={() => (m.isActive ? confirm(`إيقاف ${m.email}؟ يُخرج من اللوحة فوراً.`) : true) && act(() => setMemberActive(m.userId, !m.isActive))}>{m.isActive ? 'إيقاف' : 'تفعيل'}</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table></div>
      )}
    </>
  )
}
