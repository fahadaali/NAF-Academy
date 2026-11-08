'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { setEnrollment } from './actions'
import { setAccessUntil, transferEnrollment } from '@/admin/cohorts/actions'
import { useRouter } from 'next/navigation'
import { Badge, PageHead } from '@/admin/ui/kit'
import { when } from './labels'
import p from '@/admin/ui/panel.module.css'
import { useCan } from '@/admin/ui/perms'
import { downloadCsv } from '@/admin/ui/csv'

type Enroll = { e: { id: string; status: 'active' | 'canceled'; source: string; createdAt: string; orderId: string | null; cohortId: string | null; accessUntil: string | null }; l: { id: string; name: string; email: string; phone: string; org: string }; number: string | null; tier: string | null }
type Interest = { id: string; kind: string; name: string; email: string; phone: string; createdAt: string }

const SOURCE: Record<string, string> = { purchase: 'شراء', free: 'مجاني', grant: 'منحة', manual: 'يدوي', seat: 'مقعد مؤسسة', invite: 'دعوة' }
const KIND: Record<string, string> = { notify_open: 'أبلغني عند الفتح', waitlist: 'قائمة الانتظار', next_cohort: 'الدفعة القادمة', register: 'اهتمام بالتسجيل' }


export function LearnersBoard({ courseId, title, enrolls, interest, cohorts = [] }: { courseId: string; title: string; enrolls: Enroll[]; interest: Interest[]; cohorts?: { id: string; title: string; status: string }[] }) {
  const orders = useCan()('sales.orders')
  const router = useRouter()
  const cohortOf = (id: string | null) => cohorts.find((k) => k.id === id)?.title ?? '—'
  const [list, setList] = useState(enrolls)
  const [, start] = useTransition()
  const active = list.filter((x) => x.e.status === 'active').length
  return (
    <>
      <PageHead title="المسجّلون" sub={`${title.replace(/~\d?/g, '')} · ${active} تسجيل نشط · ${interest.length} مهتم`}
        actions={<>
          <button className="btn ghost" onClick={() => downloadCsv('learners.csv', [['الاسم', 'البريد', 'الجوال', 'الجهة', 'المصدر', 'الباقة', 'الطلب', 'الحالة', 'التاريخ'], ...list.map((x) => [x.l.name, x.l.email, x.l.phone, x.l.org, SOURCE[x.e.source], x.tier ?? '', x.number ?? '', x.e.status === 'active' ? 'نشط' : 'ملغى', x.e.createdAt])])}>تصدير المسجّلين</button>
          {orders && <Link className="btn" href={`/admin/courses/${courseId}/learners/add`}>+ إضافة مشاركين</Link>}
          {orders && <Link className="btn ghost" href="/admin/orders/new">طلب يدوي</Link>}
          <Link className="btn ghost" href={`/admin/courses/${courseId}`}>العودة للدورة</Link>
        </>} />
      {list.length === 0 ? <div className={p.empty}>لا تسجيلات بعد.</div> : (
        <div className={p.scroll}><table className={p.table}>
          <thead><tr><th>المتدرب</th><th>المصدر</th>{cohorts.length > 0 && <th>الدفعة</th>}<th>الطلب</th><th>التاريخ</th><th>الوصول</th><th>الحالة</th></tr></thead>
          <tbody>
            {list.map((x) => (
              <tr key={x.e.id}>
                <td><Link href={`/admin/learners/${x.l.id}`} className={p.rowLink}>{x.l.name}</Link><div className={`${p.muted} ${p.ltr}`}>{x.l.email}</div></td>
                <td>{SOURCE[x.e.source]}{x.tier && <div className={p.muted}>{x.tier}</div>}</td>
                {cohorts.length > 0 && (
                  <td>
                    {orders && x.e.status === 'active' ? (
                      <select className={p.select} aria-label={`دفعة ${x.l.name}`} value={x.e.cohortId ?? ''} onChange={async (ev) => {
                        const to = ev.target.value
                        if (!to || !confirm(`نقل ${x.l.name} إلى «${cohortOf(to)}»؟ يبقى تقدّمه، وتصله رسالة بمواعيد الدفعة الجديدة.`)) return
                        const r = await transferEnrollment(x.e.id, to)
                        if (!r.ok) return alert(r.error)
                        setList((l) => l.map((y) => (y.e.id === x.e.id ? { ...y, e: { ...y.e, cohortId: to } } : y)))
                      }}>
                        {!x.e.cohortId && <option value="">— بلا دفعة —</option>}
                        {cohorts.filter((k) => k.status !== 'closed' || k.id === x.e.cohortId).map((k) => <option key={k.id} value={k.id}>{k.title}</option>)}
                      </select>
                    ) : cohortOf(x.e.cohortId)}
                  </td>
                )}
                <td>{x.number && x.e.orderId ? <Link className={`${p.rowLink} num`} href={`/admin/orders/${x.e.orderId}`}>{x.number}</Link> : '—'}</td>
                <td className={`${p.muted} num`}>{when(x.e.createdAt)}</td>
                <td className="num">
                  {x.e.accessUntil ? <span data-expired={Date.parse(x.e.accessUntil) < Date.now() ? '1' : '0'} className={Date.parse(x.e.accessUntil) < Date.now() ? p.warn : p.muted}>{when(x.e.accessUntil)}</span> : <span className={p.muted}>دائم</span>}
                  {orders && x.e.status === 'active' && (
                    <button className={p.iconBtn} onClick={async () => {
                      const v = prompt('الوصول حتى (YYYY-MM-DD) — فارغ = دائم', x.e.accessUntil?.slice(0, 10) ?? '')
                      if (v === null) return
                      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return alert('صيغة التاريخ YYYY-MM-DD')
                      const until = v ? new Date(`${v}T23:59:00+03:00`).toISOString() : null
                      const r = await setAccessUntil(x.e.id, until)
                      if (!r.ok) return alert(r.error)
                      setList((l) => l.map((y) => (y.e.id === x.e.id ? { ...y, e: { ...y.e, accessUntil: until } } : y)))
                      router.refresh()
                    }}>تمديد</button>
                  )}
                </td>
                <td>
                  <Badge tone={x.e.status === 'active' ? 'open' : 'draft'}>{x.e.status === 'active' ? 'نشط' : 'ملغى'}</Badge>{' '}
                  {orders && <button className={p.iconBtn} onClick={() => {
                    const next = x.e.status === 'active' ? 'canceled' : 'active'
                    if (next === 'canceled' && !confirm(`إلغاء تسجيل ${x.l.name}؟ لا يُسترد المبلغ تلقائياً — الاسترداد من صفحة الطلب.`)) return
                    const prev = x.e.status
                    setList((l) => l.map((y) => (y.e.id === x.e.id ? { ...y, e: { ...y.e, status: next } } : y)))
                    start(async () => {
                      const r = await setEnrollment(x.e.id, next)
                      if (!r.ok) { setList((l) => l.map((y) => (y.e.id === x.e.id ? { ...y, e: { ...y.e, status: prev } } : y))); alert(r.error) }
                    })
                  }}>{x.e.status === 'active' ? 'إلغاء' : 'تفعيل'}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      <h2 className={`${p.title} ${p.between}`}>
        المهتمون وقوائم الانتظار <span className="num">({interest.length})</span>
      </h2>
      {interest.length === 0 ? <div className={p.empty}>لا أحد بعد.</div> : (
        <>
          <div className={p.scroll}><table className={p.table}>
            <thead><tr><th>الاسم</th><th>البريد</th><th>النوع</th><th>التاريخ</th></tr></thead>
            <tbody>{interest.map((i) => <tr key={i.id}><td>{i.name || '—'}</td><td className={p.ltr}>{i.email}</td><td>{KIND[i.kind]}</td><td className={`${p.muted} num`}>{when(i.createdAt)}</td></tr>)}</tbody>
          </table></div>
          <button className={`btn ghost ${p.gapStart}`} onClick={() => downloadCsv('interest.csv', [['الاسم', 'البريد', 'الجوال', 'النوع', 'التاريخ'], ...interest.map((i) => [i.name, i.email, i.phone, KIND[i.kind], i.createdAt])])}>تصدير المهتمين</button>
        </>
      )}
    </>
  )
}
