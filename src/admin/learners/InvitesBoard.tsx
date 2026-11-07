'use client'
/* دعوات الدورة: المفتوحة (تحجز مقاعدها) والمقبولة والمنتهية والملغاة — نسخ الرابط وإعادة الإرسال والإلغاء */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge, Section } from '@/admin/ui/kit'
import p from '@/admin/ui/panel.module.css'
import { useCan } from '@/admin/ui/perms'
import { formatDay } from '@/lib/dates'
import type { InviteState } from '@/lib/invites'
import { inviteLinkAction, resendInviteAction, revokeInviteAction } from './actions'

type Invite = { id: string; email: string; name: string; cohortId: string | null; state: InviteState; expiresAt: string; sentAt: string | null; acceptedAt: string | null; createdAt: string }

const STATE: Record<InviteState, { label: string; tone: string }> = {
  pending: { label: 'بانتظار القبول', tone: 'soon' }, accepted: { label: 'قُبلت', tone: 'open' }, expired: { label: 'انتهت', tone: 'closed' }, revoked: { label: 'ملغاة', tone: 'archived' },
}

export function InvitesBoard({ invites, cohorts }: { invites: Invite[]; cohorts: { id: string; title: string }[] }) {
  const can = useCan()('sales.orders')
  const router = useRouter()
  const [msg, setMsg] = useState('')
  if (!invites.length) return null
  const pending = invites.filter((i) => i.state === 'pending').length
  const copy = async (link: string) => { await navigator.clipboard?.writeText(link); setMsg('نُسخ الرابط') }
  return (
    <Section title="الدعوات" desc={`${invites.length} دعوة · ${pending} بانتظار القبول (تحجز مقاعدها)`}>
      {msg && <p role="status" className={p.muted}>{msg}</p>}
      <div className={p.scroll}><table className={p.table}>
        <thead><tr><th>المدعو</th>{cohorts.length > 0 && <th>الدفعة</th>}<th>الحالة</th><th>صالحة حتى</th>{can && <th>أدوات</th>}</tr></thead>
        <tbody>{invites.map((i) => (
          <tr key={i.id}>
            <td>{i.name || '—'}<div className={`${p.muted} ${p.ltr}`}>{i.email}</div></td>
            {cohorts.length > 0 && <td>{cohorts.find((k) => k.id === i.cohortId)?.title ?? '—'}</td>}
            <td><Badge tone={STATE[i.state].tone}>{STATE[i.state].label}</Badge>{i.state === 'pending' && !i.sentAt && <div className={p.muted}>لم يُرسل البريد</div>}</td>
            <td className="num">{i.state === 'accepted' && i.acceptedAt ? formatDay(i.acceptedAt) : formatDay(i.expiresAt)}</td>
            {can && (
              <td>
                {i.state === 'pending' && <button type="button" className="btn ghost" onClick={async () => { const r = await inviteLinkAction(i.id); if (r.ok) copy(r.link); else setMsg(r.error) }}>نسخ الرابط</button>}
                {(i.state === 'pending' || i.state === 'expired') && <button type="button" className="btn ghost" onClick={async () => {
                  if (!confirm(`إرسال رابط جديد إلى ${i.email}؟ يبطل الرابط السابق وتُمدّ الصلاحية.`)) return
                  const r = await resendInviteAction(i.id)
                  if (!r.ok) return setMsg(r.error)
                  if (r.mailed) setMsg('أُرسل رابط جديد')
                  else await copy(r.link)
                  router.refresh()
                }}>إعادة الإرسال</button>}
                {i.state === 'pending' && <button type="button" className="btn ghost" onClick={async () => {
                  if (!confirm(`إلغاء دعوة ${i.email}؟ يبطل الرابط ويتحرر المقعد.`)) return
                  const r = await revokeInviteAction(i.id)
                  if (!r.ok) return setMsg(r.error ?? 'تعذّر الإلغاء')
                  router.refresh()
                }}>إلغاء</button>}
              </td>
            )}
          </tr>
        ))}</tbody>
      </table></div>
    </Section>
  )
}
