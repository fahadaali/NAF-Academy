import 'server-only'
/* تخصيص مقعد من طلب جماعي — مشترك بين اللوحة ومسؤول المؤسسة. الحجز ذري: لا يُخصَّص المقعد مرتين. */
import { randomUUID } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema as s } from './db'
import { accessUntilOf, upsertLearner } from './sales'
import { audit } from './audit'

export async function assignSeatCore(grantId: string, email: string, name: string, by: string): Promise<{ ok: boolean; error?: string; orderId?: string }> {
  const e = z.string().trim().toLowerCase().email().safeParse(email)
  if (!e.success) return { ok: false, error: 'بريد غير صالح' }
  const [g] = await db.select().from(s.seatGrants).where(and(eq(s.seatGrants.id, grantId), isNull(s.seatGrants.enrollmentId)))
  if (!g) return { ok: false, error: 'المقعد مخصّص من قبل' }
  const [ord] = await db.select({ status: s.orders.status }).from(s.orders).where(eq(s.orders.id, g.orderId))
  if (!ord || !['paid', 'partially_refunded'].includes(ord.status)) return { ok: false, error: 'لا يمكن تخصيص مقاعد طلب غير مدفوع أو مسترد' }
  /* مخصِّص المقعد ليس صاحب الحساب: يملأ الاسم إن كان فارغاً ولا يغيّره */
  const learner = await upsertLearner({ name: name.trim(), email: e.data, phone: '', org: '', vatNumber: '' })
  const [dup] = await db.select().from(s.enrollments).where(and(eq(s.enrollments.learnerId, learner.id), eq(s.enrollments.courseId, g.courseId), eq(s.enrollments.status, 'active')))
  if (dup) return { ok: false, error: 'هذا المشارك مسجّل في الدورة من قبل' }
  const [item] = await db.select().from(s.orderItems).where(and(eq(s.orderItems.orderId, g.orderId), eq(s.orderItems.courseId, g.courseId)))
  const eid = randomUUID()
  await db.insert(s.enrollments).values({ id: eid, learnerId: learner.id, courseId: g.courseId, tierId: item?.tierId ?? null, cohortId: g.cohortId, orderId: g.orderId, source: 'seat', accessUntil: await accessUntilOf(g.courseId, g.cohortId) })
  const claimed = await db.update(s.seatGrants).set({ email: learner.email, enrollmentId: eid }).where(and(eq(s.seatGrants.id, grantId), isNull(s.seatGrants.enrollmentId))).returning({ id: s.seatGrants.id })
  if (!claimed.length) {
    await db.delete(s.enrollments).where(eq(s.enrollments.id, eid))
    return { ok: false, error: 'المقعد مخصّص من قبل' }
  }
  await audit(by, 'assign', 'order', g.orderId, `مقعد ← ${learner.email}`)
  const { onEnrolled } = await import('./notify/engine')
  await onEnrolled(eid)
  return { ok: true, orderId: g.orderId }
}
