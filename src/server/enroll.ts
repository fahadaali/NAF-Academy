import 'server-only'
/* التسجيل المباشر بلا طلب ولا دفع — للإضافة الجماعية من اللوحة ولقبول الدعوات (برامج الجامعات والتدريب التعاوني).
   على نمط مقاعد العقود: يُدرج التسجيل ثم يُعدّ، فإن تجاوز المشغول السعة تراجع المتأخر. لا فاتورة (المبلغ صفر). */
import { randomUUID } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema as s } from './db'
import { audit } from './audit'
import { accessUntilOf, noRoom, overCapacity, upsertLearner } from './sales'
import { cohortState, hasAccess } from '@/lib/cohorts'

export type DirectLearner = { name: string; email: string; phone?: string; org?: string; nameEn?: string }

export type EnrollResult =
  | { ok: true; status: 'enrolled' | 'renewed' | 'already'; enrollmentId: string; learnerId: string }
  | { ok: false; error: string }

/**
 * يسجّل المتدرب في الدورة (ودفعتها). `heldSeat`: المقعد محجوز مسبقاً (دعوة) فلا يُفحص المتّسع.
 * المسجّل الساري وصوله يُعاد «already» بلا تغيير، والمنتهي وصوله يُجدَّد تسجيله نفسه.
 */
export async function enrollDirect(v: { courseId: string; cohortId?: string | null; learner: DirectLearner; source: 'grant' | 'invite'; by: string; heldSeat?: boolean }): Promise<EnrollResult> {
  const [course] = await db.select().from(s.courses).where(and(eq(s.courses.id, v.courseId), isNull(s.courses.deletedAt)))
  if (!course || course.status === 'archived') return { ok: false, error: 'الدورة غير متاحة' }
  const cohorts = await db.select().from(s.cohorts).where(and(eq(s.cohorts.courseId, course.id), isNull(s.cohorts.deletedAt)))
  const cohort = cohorts.find((k) => k.id === v.cohortId) ?? null
  if (cohorts.length && !cohort) return { ok: false, error: 'اختر الدفعة' }
  if (cohort && cohortState({ ...cohort, taken: 0 }) === 'closed') return { ok: false, error: `الدفعة «${cohort.title}» مغلقة أو انتهت` }
  /* الموظف (أو صاحب الحساب بعد قبول دعوته) يحدّث الاسم والجوال */
  const learner = await upsertLearner({ name: v.learner.name, email: v.learner.email, phone: v.learner.phone ?? '', org: v.learner.org ?? '', vatNumber: '', nameEn: v.learner.nameEn }, { trusted: true })
  const [dup] = await db.select().from(s.enrollments).where(and(eq(s.enrollments.learnerId, learner.id), eq(s.enrollments.courseId, course.id), eq(s.enrollments.status, 'active')))
  if (dup && hasAccess(dup)) return { ok: true, status: 'already', enrollmentId: dup.id, learnerId: learner.id }
  const cohortId = cohort?.id ?? null
  /* المنتهي وصوله يبقى في دفعته فلا يأخذ مقعداً جديداً */
  const keeps = !!dup && (!cohorts.length || dup.cohortId === cohortId)
  const check = !keeps && !v.heldSeat
  if (check) {
    const room = await noRoom(course, cohort, 1)
    if (room) return { ok: false, error: cohort ? `${room} في «${cohort.title}»` : room }
  }
  const accessUntil = await accessUntilOf(course.id, cohortId)
  const eid = dup?.id ?? randomUUID()
  const now = new Date().toISOString()
  if (dup) await db.update(s.enrollments).set({ cohortId, accessUntil, updatedAt: now }).where(eq(s.enrollments.id, dup.id))
  else {
    const [row] = await db.insert(s.enrollments).values({ id: eid, learnerId: learner.id, courseId: course.id, cohortId, source: v.source, accessUntil })
      .onConflictDoNothing().returning({ id: s.enrollments.id })
    /* سباق مع تسجيل آخر للمتدرب نفسه (فهرس التسجيل النشط الواحد) */
    if (!row) {
      const [other] = await db.select().from(s.enrollments).where(and(eq(s.enrollments.learnerId, learner.id), eq(s.enrollments.courseId, course.id), eq(s.enrollments.status, 'active')))
      return other ? { ok: true, status: 'already', enrollmentId: other.id, learnerId: learner.id } : { ok: false, error: 'تعذّر التسجيل — أعد المحاولة' }
    }
  }
  if (check && (await overCapacity(course, cohort))) {
    if (dup) await db.update(s.enrollments).set({ cohortId: dup.cohortId, accessUntil: dup.accessUntil }).where(eq(s.enrollments.id, dup.id))
    else await db.delete(s.enrollments).where(eq(s.enrollments.id, eid))
    return { ok: false, error: 'اكتملت المقاعد للتو' }
  }
  await audit(v.by, v.source === 'invite' ? 'accept' : 'enroll', 'enrollment', eid, `${learner.email} ← ${course.title}${cohort ? ` · ${cohort.title}` : ''}`)
  const { onEnrolled } = await import('./notify/engine')
  await onEnrolled(eid)
  return { ok: true, status: dup ? 'renewed' : 'enrolled', enrollmentId: eid, learnerId: learner.id }
}
