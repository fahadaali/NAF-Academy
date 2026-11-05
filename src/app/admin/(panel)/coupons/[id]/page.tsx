import { notFound } from 'next/navigation'
import Link from 'next/link'
import { asc, eq, isNull } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { requireAdmin } from '@/server/auth'
import { couponRedemptionsOf } from '@/admin/sales/data'
import { CouponEditor } from '@/admin/sales/CouponEditor'
import { sar, when } from '@/admin/sales/labels'
import p from '@/admin/ui/panel.module.css'

export default async function CouponPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireAdmin()
  const [courses, tracks] = await Promise.all([
    db.select({ id: s.courses.id, title: s.courses.title }).from(s.courses).where(isNull(s.courses.deletedAt)).orderBy(asc(s.courses.sortOrder)),
    db.select({ id: s.tracks.id, title: s.tracks.title }).from(s.tracks).where(isNull(s.tracks.deletedAt)).orderBy(asc(s.tracks.sortOrder)),
  ])
  if (id === 'new') return <CouponEditor id={null} courses={courses} tracks={tracks} initial={{ code: '', label: '', kind: 'percent', value: 10, scope: 'all', courseIds: [], trackIds: [], startsAt: null, endsAt: null, maxUses: null, maxPerLearner: 1, minAmount: null, emailDomain: '', stackWithSale: false, active: true }} />
  const [c] = await db.select().from(s.coupons).where(eq(s.coupons.id, id))
  if (!c) notFound()
  const uses = await couponRedemptionsOf(id)
  const { code, label, kind, value, scope, courseIds, trackIds, startsAt, endsAt, maxUses, maxPerLearner, minAmount, emailDomain, stackWithSale, active } = c
  return (
    <>
      <CouponEditor key={c.updatedAt} id={id} courses={courses} tracks={tracks} initial={{ code, label, kind, value, scope, courseIds, trackIds, startsAt, endsAt, maxUses, maxPerLearner, minAmount, emailDomain, stackWithSale, active }} />
      <h2 style={{ fontSize: 20, margin: '30px 0 12px' }}>سجل الاستخدام <span className="num">({uses.length})</span></h2>
      {uses.length === 0 ? <div className={p.empty}>لم يُستخدم بعد.</div> : (
        <table className={p.table}>
          <thead><tr><th>الطلب</th><th>المتدرب</th><th>الخصم</th><th>الوقت</th></tr></thead>
          <tbody>{uses.map((u) => <tr key={u.orderId}><td><Link className={`${p.rowLink} num`} href={`/admin/orders/${u.orderId}`}>{u.number}</Link></td><td dir="ltr" style={{ textAlign: 'end' }}>{u.email}</td><td className="num">{sar(u.amount)}</td><td className={`${p.muted} num`}>{when(u.at)}</td></tr>)}</tbody>
        </table>
      )}
    </>
  )
}
