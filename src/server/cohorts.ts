import 'server-only'
/* الدفعات على الخادم — المقاعد المشغولة لكل دفعة، ومواعيد جلساتها. */
import { and, count, eq, gt, inArray, isNull, or, sum } from 'drizzle-orm'
import { db, schema as s } from './db'
import { inList } from './db/limits'
import type { CohortLite } from '@/lib/cohorts'
import type { CohortRow } from './db/schema'

/** دعوة تحجز مقعداً: لم تُقبل ولم تُلغَ ولم تنتهِ (قرار المالك) */
export const inviteHolds = (now = new Date().toISOString()) =>
  and(isNull(s.invitations.acceptedAt), isNull(s.invitations.revokedAt), gt(s.invitations.expiresAt, now))

/** تسجيل يشغل مقعداً: نشط وساري الوصول — المنتهي وصوله يجدّد دون أن يأخذ مقعداً (قرار المالك) */
export const holdsSeat = (now = new Date().toISOString()) =>
  and(eq(s.enrollments.status, 'active'), or(isNull(s.enrollments.accessUntil), gt(s.enrollments.accessUntil, now)))

/** دفعات الدورات (غير المحذوفة) بالمقاعد المشغولة: المحجوز يدوياً + التسجيلات النشطة + مقاعد المؤسسات غير المخصّصة */
export async function cohortsOf(courseIds: string[]): Promise<Map<string, (CohortLite & { row: CohortRow })[]>> {
  const out = new Map<string, (CohortLite & { row: CohortRow })[]>()
  if (!courseIds.length) return out
  const rows = await db.select().from(s.cohorts).where(and(inList(s.cohorts.courseId, courseIds), isNull(s.cohorts.deletedAt)))
  if (!rows.length) return out
  const ids = rows.map((r) => r.id)
  const [en, gr, iv] = await Promise.all([
    db.select({ id: s.enrollments.cohortId, n: count() }).from(s.enrollments)
      .where(and(inList(s.enrollments.cohortId, ids), holdsSeat())).groupBy(s.enrollments.cohortId),
    db.select({ id: s.seatGrants.cohortId, n: count() }).from(s.seatGrants).innerJoin(s.orders, eq(s.orders.id, s.seatGrants.orderId))
      .where(and(inList(s.seatGrants.cohortId, ids), isNull(s.seatGrants.enrollmentId), inArray(s.orders.status, ['paid', 'partially_refunded']))).groupBy(s.seatGrants.cohortId),
    db.select({ id: s.invitations.cohortId, n: count() }).from(s.invitations).where(and(inList(s.invitations.cohortId, ids), inviteHolds())).groupBy(s.invitations.cohortId),
  ])
  const used = new Map<string, number>()
  for (const r of [...en, ...gr, ...iv]) if (r.id) used.set(r.id, (used.get(r.id) ?? 0) + r.n)
  for (const r of rows.sort((a, b) => a.sortOrder - b.sortOrder)) {
    const lite = { id: r.id, title: r.title, status: r.status, startsAt: r.startsAt, endsAt: r.endsAt, seatsTotal: r.seatsTotal, taken: r.seatsTaken + (used.get(r.id) ?? 0), city: r.city, row: r }
    out.set(r.courseId, [...(out.get(r.courseId) ?? []), lite])
  }
  return out
}

/** المشغول في دفعة لحظة الحجز — ومعه الطلبات المعلّقة السارية والدعوات المفتوحة (كما في seatsUsed للدورة) */
export async function cohortSeatsUsed(c: Pick<CohortRow, 'id' | 'seatsTaken'>) {
  const now = new Date().toISOString()
  const [e] = await db.select({ n: count() }).from(s.enrollments).where(and(eq(s.enrollments.cohortId, c.id), holdsSeat(now)))
  const [g] = await db.select({ n: count() }).from(s.seatGrants).innerJoin(s.orders, eq(s.orders.id, s.seatGrants.orderId))
    .where(and(eq(s.seatGrants.cohortId, c.id), isNull(s.seatGrants.enrollmentId), inArray(s.orders.status, ['paid', 'partially_refunded'])))
  const [p] = await db.select({ n: sum(s.orderItems.quantity) }).from(s.orderItems).innerJoin(s.orders, eq(s.orders.id, s.orderItems.orderId))
    .where(and(eq(s.orderItems.cohortId, c.id), eq(s.orders.status, 'pending'), gt(s.orders.expiresAt, now)))
  const [i] = await db.select({ n: count() }).from(s.invitations).where(and(eq(s.invitations.cohortId, c.id), inviteHolds(now)))
  return c.seatsTaken + e.n + g.n + Number(p.n ?? 0) + i.n
}

/** مواعيد جلسات الدفعة لكل درس */
export async function sessionsOf(cohortId: string | null | undefined) {
  if (!cohortId) return null
  const rows = await db.select().from(s.cohortSessions).where(eq(s.cohortSessions.cohortId, cohortId))
  return new Map(rows.map((r) => [r.lessonId, r]))
}
