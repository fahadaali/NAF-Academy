/* ملف المتدرب — دوراته وتقدّمه، وطلباته (للمبيعات)، وشهاداته، ومؤسساته، واهتماماته، وتقييماته، ورسائله (لسجل الرسائل) */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { learnerProfile } from '@/admin/learners/data'
import { staffCan } from '@/server/auth'
import { Badge, PageHead, Section } from '@/admin/ui/kit'
import { ORDER_LABEL, ORDER_TONE, sar, when } from '@/admin/sales/labels'
import p from '@/admin/ui/panel.module.css'

const SOURCE: Record<string, string> = { purchase: 'شراء', free: 'مجاني', grant: 'منحة', manual: 'يدوي', seat: 'مقعد مؤسسة' }
const CERT: Record<string, string> = { pending: 'بانتظار المراجعة', issued: 'صادرة', rejected: 'مرفوضة', revoked: 'ملغاة' }
const KIND: Record<string, string> = { notify_open: 'أبلغني عند الفتح', waitlist: 'قائمة الانتظار', next_cohort: 'الدفعة القادمة', register: 'اهتمام بالتسجيل' }

export default async function LearnerPage({ params }: { params: Promise<{ id: string }> }) {
  const d = await learnerProfile((await params).id)
  if (!d) notFound()
  const [canSales, canLog] = await Promise.all([staffCan('sales.read'), staffCan('messages.read')])
  const { learner: l } = d
  return (
    <>
      <PageHead title={l.name} sub={`منذ ${when(l.createdAt)}`} actions={<Link className="btn ghost" href="/admin/learners">← المتدربون</Link>} />
      <div className={p.stats}>
        <div className={p.stat}><strong className="num" data-count>{d.enrolls.filter((x) => x.e.status === 'active').length}</strong><span>دورة نشطة</span></div>
        <div className={p.stat}><strong className="num" data-count>{d.certs.filter((x) => x.status === 'issued').length}</strong><span>شهادة صادرة</span></div>
        {canSales && <div className={p.stat}><strong className="num">{sar(d.orders.filter((o) => ['paid', 'partially_refunded'].includes(o.status)).reduce((a, o) => a + o.total - o.refunded, 0))}</strong><span>صافي المدفوع (ر.س)</span></div>}
      </div>
      <Section title="البيانات">
        <dl className={p.facts}>
          <div><dt>البريد</dt><dd dir="ltr">{l.email}</dd></div>
          <div><dt>الجوال</dt><dd dir="ltr">{l.phone || '—'}</dd></div>
          <div><dt>الجهة</dt><dd>{l.org || '—'}</dd></div>
          <div><dt>الرقم الضريبي</dt><dd className="num">{l.vatNumber || '—'}</dd></div>
          {d.orgs.length > 0 && <div><dt>المؤسسات</dt><dd>{d.orgs.map((o) => <Link key={o.o.id} href={`/admin/organizations/${o.o.id}`}>{o.o.name}{o.role === 'manager' ? ' (مسؤول)' : ''}</Link>)}</dd></div>}
        </dl>
      </Section>
      <Section title="الدورات" desc="التقدّم للتسجيلات النشطة">
        {d.enrolls.length === 0 ? <p className={p.muted}>لا تسجيلات.</p> : (
          <div className={p.scroll}><table className={p.table}>
            <thead><tr><th>الدورة</th><th>المصدر</th><th>التقدّم</th><th>الحالة</th><th>التاريخ</th></tr></thead>
            <tbody>{d.enrolls.map((x) => (
              <tr key={x.e.id}>
                <td><strong>{x.title}</strong>{x.tier && <div className={p.muted}>{x.tier}</div>}</td>
                <td className={p.muted}>{SOURCE[x.e.source] ?? x.e.source}{x.number ? ` · ${x.number}` : ''}</td>
                <td className="num">{x.pct === null ? '—' : `${x.pct}%`}</td>
                <td><Badge tone={x.e.status === 'active' ? 'open' : 'draft'}>{x.e.status === 'active' ? 'نشط' : 'ملغى'}</Badge></td>
                <td className={`${p.muted} num`}>{when(x.e.createdAt)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Section>
      {canSales && (
        <Section title="الطلبات">
          {d.orders.length === 0 ? <p className={p.muted}>لا طلبات.</p> : (
            <div className={p.scroll}><table className={p.table}>
              <thead><tr><th>الطلب</th><th>الحالة</th><th>المبلغ</th><th>التاريخ</th></tr></thead>
              <tbody>{d.orders.map((o) => (
                <tr key={o.id}>
                  <td><Link href={`/admin/orders/${o.id}`} className={p.rowLink}>{o.number}</Link></td>
                  <td><Badge tone={ORDER_TONE[o.status]}>{ORDER_LABEL[o.status]}</Badge></td>
                  <td className="num">{sar(o.total)}{o.refunded ? <div className={p.muted}>مسترد {sar(o.refunded)}</div> : null}</td>
                  <td className={`${p.muted} num`}>{when(o.createdAt)}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Section>
      )}
      <Section title="الشهادات">
        {d.certs.length === 0 ? <p className={p.muted}>لا شهادات.</p> : (
          <div className={p.scroll}><table className={p.table}><tbody>{d.certs.map((c) => (
            <tr key={c.id}>
              <td><strong>{c.courseTitle}</strong></td>
              <td><Badge tone={c.status === 'issued' ? 'open' : c.status === 'revoked' ? 'closed' : 'soon'}>{CERT[c.status] ?? c.status}</Badge></td>
              <td>{c.code ? <a href={`/certificates/${c.code}`} target="_blank" rel="noreferrer" dir="ltr">{c.code} ↗</a> : '—'}</td>
            </tr>
          ))}</tbody></table></div>
        )}
      </Section>
      {(d.interest.length > 0 || d.reviews.length > 0) && (
        <Section title="الاهتمام والتقييمات">
          <div className={p.scroll}><table className={p.table}><tbody>
            {d.interest.map((x) => <tr key={x.i.id}><td>{x.title}</td><td className={p.muted}>{KIND[x.i.kind] ?? x.i.kind}</td><td className={`${p.muted} num`}>{x.i.notifiedAt ? `أُبلغ ${when(x.i.notifiedAt)}` : 'لم يُبلَّغ بعد'}</td></tr>)}
            {d.reviews.map((x) => <tr key={x.r.id}><td>{x.title}</td><td className="num">{'★'.repeat(x.r.rating)}</td><td className={p.muted}>{x.r.comment || '—'}</td></tr>)}
          </tbody></table></div>
        </Section>
      )}
      {canLog && (
        <Section title="الرسائل" desc="آخر 60 رسالة إلى بريده أو جواله">
          {d.messages.length === 0 ? <p className={p.muted}>لا رسائل.</p> : (
            <div className={p.scroll}><table className={p.table}><tbody>{d.messages.map((m) => (
              <tr key={m.id}>
                <td><strong>{m.subject || m.body.slice(0, 60)}</strong><div className={p.muted}>{m.channel === 'email' ? 'بريد' : m.channel === 'sms' ? 'جوال' : 'متصفح'} · {m.kind}</div></td>
                <td><Badge tone={m.status === 'sent' || m.status === 'outbox' ? 'open' : 'closed'}>{m.status}</Badge></td>
                <td className={`${p.muted} num`}>{when(m.createdAt)}</td>
              </tr>
            ))}</tbody></table></div>
          )}
        </Section>
      )}
    </>
  )
}
