import 'server-only'
/* قراءات المبيعات للوحة — تُستدعى بعد requireAdmin. */
import { and, asc, count, desc, eq, gte, inArray, isNull, sql, sum } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { courseScope, inScope, requirePermission } from '@/server/auth'
import { inList } from '@/server/db/limits'

const PAID = ['paid', 'partially_refunded', 'refunded'] as const

export async function salesOverview() {
  await requirePermission('sales.read')
  const since30 = new Date(Date.now() - 30 * 864e5).toISOString()
  const [all] = await db.select({ gross: sum(s.orders.total), refunded: sum(s.orders.refunded), n: count() }).from(s.orders).where(inArray(s.orders.status, [...PAID]))
  const [d30] = await db.select({ gross: sum(s.orders.total), refunded: sum(s.orders.refunded), n: count() }).from(s.orders).where(and(inArray(s.orders.status, [...PAID]), gte(s.orders.paidAt, since30)))
  const [pending] = await db.select({ n: count() }).from(s.orders).where(and(eq(s.orders.status, 'pending'), gte(s.orders.expiresAt, new Date().toISOString())))
  const [enrolled] = await db.select({ n: count() }).from(s.enrollments).where(eq(s.enrollments.status, 'active'))
  const [interested] = await db.select({ n: count() }).from(s.interest)
  const topCourses = await db.select({ title: s.orderItems.title, revenue: sum(s.orderItems.lineTotal), seats: sum(s.orderItems.quantity) })
    .from(s.orderItems).innerJoin(s.orders, eq(s.orders.id, s.orderItems.orderId)).where(inArray(s.orders.status, [...PAID]))
    .groupBy(s.orderItems.title).orderBy(desc(sum(s.orderItems.lineTotal))).limit(5)
  const topCoupons = await db.select({ code: s.orders.couponCode, uses: count(), discount: sum(s.orders.couponDiscount), revenue: sum(s.orders.total) })
    .from(s.orders).where(and(inArray(s.orders.status, [...PAID]), sql`${s.orders.couponCode} <> ''`))
    .groupBy(s.orders.couponCode).orderBy(desc(count())).limit(5)
  const recent = await db.select().from(s.orders).orderBy(desc(s.orders.createdAt)).limit(8)
  /* الإيراد اليومي آخر 30 يوماً */
  /* اليوم بتوقيت الرياض — كما تجمّعه التحليلات */
  const day = sql<string>`substr(datetime(${s.orders.paidAt}, '+3 hours'), 1, 10)`
  const daily = await db.select({ day, net: sql<number>`sum(${s.orders.total} - ${s.orders.refunded})` })
    .from(s.orders).where(and(inArray(s.orders.status, [...PAID]), gte(s.orders.paidAt, since30))).groupBy(day)
  const n = (x: unknown) => Number(x ?? 0)
  return {
    net: n(all.gross) - n(all.refunded), orders: all.n, net30: n(d30.gross) - n(d30.refunded), orders30: d30.n,
    pending: pending.n, enrolled: enrolled.n, interested: interested.n, topCourses, topCoupons, recent, daily,
  }
}

export async function ordersList() {
  await requirePermission('sales.read')
  const rows = await db.select().from(s.orders).orderBy(desc(s.orders.createdAt)).limit(1000)
  const items = rows.length ? await db.select().from(s.orderItems).where(inList(s.orderItems.orderId, rows.map((r) => r.id))) : []
  const now = new Date().toISOString()
  return rows.map((o) => ({
    ...o,
    status: o.status === 'pending' && o.expiresAt && o.expiresAt < now ? ('expired' as const) : o.status,
    items: items.filter((i) => i.orderId === o.id),
  }))
}

export async function orderDetail(id: string) {
  await requirePermission('sales.read')
  const [order] = await db.select().from(s.orders).where(eq(s.orders.id, id))
  if (!order) return null
  const [items, pays, refunds, invoices, grants, enrolls, log] = await Promise.all([
    db.select().from(s.orderItems).where(eq(s.orderItems.orderId, id)),
    db.select().from(s.payments).where(eq(s.payments.orderId, id)).orderBy(asc(s.payments.createdAt)),
    db.select().from(s.refunds).where(eq(s.refunds.orderId, id)).orderBy(asc(s.refunds.createdAt)),
    db.select().from(s.invoices).where(eq(s.invoices.orderId, id)).orderBy(asc(s.invoices.issuedAt)),
    db.select().from(s.seatGrants).where(eq(s.seatGrants.orderId, id)),
    db.select({ e: s.enrollments, l: s.learners }).from(s.enrollments).innerJoin(s.learners, eq(s.learners.id, s.enrollments.learnerId)).where(eq(s.enrollments.orderId, id)),
    db.select().from(s.auditLog).where(and(eq(s.auditLog.entity, 'order'), eq(s.auditLog.entityId, id))).orderBy(asc(s.auditLog.id)),
  ])
  return { order, items, pays, refunds, invoices, grants, enrolls, log }
}

export async function couponsList() {
  await requirePermission('sales.coupons')
  const rows = await db.select().from(s.coupons).where(isNull(s.coupons.deletedAt)).orderBy(desc(s.coupons.createdAt))
  const usage = await db.select({ couponId: s.couponRedemptions.couponId, uses: count(), discount: sum(s.couponRedemptions.amount) })
    .from(s.couponRedemptions).groupBy(s.couponRedemptions.couponId)
  const revenue = await db.select({ couponId: s.orders.couponId, revenue: sum(s.orders.total) }).from(s.orders)
    .where(inArray(s.orders.status, [...PAID])).groupBy(s.orders.couponId)
  const u = new Map(usage.map((x) => [x.couponId, x]))
  const r = new Map(revenue.map((x) => [x.couponId, Number(x.revenue ?? 0)]))
  return rows.map((c) => ({ ...c, uses: u.get(c.id)?.uses ?? 0, discountTotal: Number(u.get(c.id)?.discount ?? 0), revenue: r.get(c.id) ?? 0 }))
}

export async function couponRedemptionsOf(id: string) {
  await requirePermission('sales.coupons')
  return db.select({ at: s.couponRedemptions.createdAt, amount: s.couponRedemptions.amount, number: s.orders.number, orderId: s.orders.id, email: s.learners.email })
    .from(s.couponRedemptions)
    .innerJoin(s.orders, eq(s.orders.id, s.couponRedemptions.orderId))
    .innerJoin(s.learners, eq(s.learners.id, s.couponRedemptions.learnerId))
    .where(eq(s.couponRedemptions.couponId, id)).orderBy(desc(s.couponRedemptions.createdAt))
}

export async function courseLearners(courseId: string) {
  const scope = await courseScope(await requirePermission('learners.read'))
  if (!inScope(scope, courseId)) return { enrolls: [], interest: [], cohorts: [] }
  const [enrolls, interest] = await Promise.all([
    db.select({ e: s.enrollments, l: s.learners, number: s.orders.number, tier: s.priceTiers.name })
      .from(s.enrollments).innerJoin(s.learners, eq(s.learners.id, s.enrollments.learnerId))
      .leftJoin(s.orders, eq(s.orders.id, s.enrollments.orderId)).leftJoin(s.priceTiers, eq(s.priceTiers.id, s.enrollments.tierId))
      .where(eq(s.enrollments.courseId, courseId)).orderBy(desc(s.enrollments.createdAt)),
    db.select().from(s.interest).where(eq(s.interest.courseId, courseId)).orderBy(desc(s.interest.createdAt)),
  ])
  const cohorts = await db.select({ id: s.cohorts.id, title: s.cohorts.title, status: s.cohorts.status }).from(s.cohorts)
    .where(and(eq(s.cohorts.courseId, courseId), isNull(s.cohorts.deletedAt))).orderBy(asc(s.cohorts.sortOrder))
  return { enrolls, interest, cohorts }
}

/** طابور وافق: المكتمل والمعلّق والفاشل، وآخر ما فشل — لصفحة الإعداد */
export async function wafeqQueue() {
  await requirePermission('payments.manage')
  const rows = await db.select({ st: s.invoices.wafeqStatus, n: count() }).from(s.invoices)
    .where(inArray(s.invoices.wafeqStatus, ['pending', 'running', 'failed', 'done'])).groupBy(s.invoices.wafeqStatus)
  const by = Object.fromEntries(rows.map((r) => [r.st, r.n])) as Record<string, number>
  const failed = await db.select({ id: s.invoices.id, number: s.invoices.number, orderId: s.invoices.orderId, error: s.invoices.wafeqError })
    .from(s.invoices).where(eq(s.invoices.wafeqStatus, 'failed')).orderBy(desc(s.invoices.issuedAt)).limit(10)
  return { counts: { done: by.done ?? 0, pending: (by.pending ?? 0) + (by.running ?? 0), failed: by.failed ?? 0 }, failed }
}
