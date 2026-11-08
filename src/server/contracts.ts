import 'server-only'
/* عقود المؤسسات — مقاعد في نافذة زمنية لنطاق دورات. التخصيص يصير تسجيلاً (enrollments.contractId) بحجز ذري:
   يُدرج التسجيل ثم يُعدّ، فإن تجاوز العدد السعة تراجع المتأخر. مشترك بين اللوحة ومسؤول المؤسسة. */
import { randomUUID } from 'node:crypto'
import { and, count, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema as s } from './db'
import { audit } from './audit'
import { upsertLearner, accessUntilOf, noRoom, overCapacity } from './sales'
import { cohortState, hasAccess } from '@/lib/cohorts'
import type { ContractRow } from './db/schema'
import { refreshPublicPages } from './page-cache'

/** الحالة الفعلية الآن: الساري بعد نهايته «منتهٍ» */
export function contractState(c: Pick<ContractRow, 'status' | 'startsAt' | 'endsAt'>, now = new Date()): ContractRow['status'] | 'upcoming' {
  if (c.status !== 'active') return c.status
  if (c.endsAt && Date.parse(c.endsAt) <= now.getTime()) return 'expired'
  if (c.startsAt && Date.parse(c.startsAt) > now.getTime()) return 'upcoming'
  return 'active'
}

/** هل الدورة في نطاق العقد؟ «كل الدورات» = العامة وحدها، والخاص بالاسم في نطاق «دورات محددة» */
export function inContract(c: Pick<ContractRow, 'scope' | 'courseIds'>, course: { id: string; visibility: 'public' | 'private' }) {
  return c.scope === 'courses' ? c.courseIds.includes(course.id) : course.visibility !== 'private'
}

export async function contractUsed(contractId: string) {
  const [r] = await db.select({ n: count() }).from(s.enrollments).where(and(eq(s.enrollments.contractId, contractId), eq(s.enrollments.status, 'active')))
  return r.n
}

/** عقود المؤسسة بالاستهلاك */
export async function orgContracts(orgId: string) {
  const rows = await db.select().from(s.orgContracts).where(and(eq(s.orgContracts.orgId, orgId), isNull(s.orgContracts.deletedAt)))
  return Promise.all(rows.map(async (r) => ({ row: r, used: await contractUsed(r.id), state: contractState(r) })))
}

export async function assignContractSeat(contractId: string, v: { email: string; name: string; courseId: string; cohortId?: string | null }, by: string): Promise<{ ok: boolean; error?: string }> {
  const e = z.string().trim().toLowerCase().email().safeParse(v.email)
  if (!e.success) return { ok: false, error: 'بريد غير صالح' }
  const [c] = await db.select().from(s.orgContracts).where(and(eq(s.orgContracts.id, contractId), isNull(s.orgContracts.deletedAt)))
  if (!c) return { ok: false, error: 'العقد غير موجود' }
  if (contractState(c) !== 'active') return { ok: false, error: 'العقد غير ساري الآن' }
  if (c.scope === 'courses' && !c.courseIds.includes(v.courseId)) return { ok: false, error: 'الدورة خارج نطاق العقد' }
  const [course] = await db.select().from(s.courses).where(and(eq(s.courses.id, v.courseId), isNull(s.courses.deletedAt)))
  if (!course || course.status === 'archived' || course.status === 'draft') return { ok: false, error: 'الدورة غير متاحة' }
  /* البرنامج الخاص لا يدخل في «كل الدورات» — يشمله العقد إن سمّاه صراحة فقط */
  if (!inContract(c, course)) return { ok: false, error: 'البرنامج الخاص خارج نطاق العقد' }
  /* الدورة ذات الدفعات: دفعة منها لم تُغلق ولم تنتهِ */
  const cohorts = await db.select().from(s.cohorts).where(and(eq(s.cohorts.courseId, course.id), isNull(s.cohorts.deletedAt)))
  const cohort = cohorts.find((k) => k.id === v.cohortId) ?? null
  if (cohorts.length && (!cohort || cohortState({ ...cohort, taken: 0 }) === 'closed')) return { ok: false, error: 'اختر دفعة مفتوحة' }
  if ((await contractUsed(c.id)) >= c.seats) return { ok: false, error: 'استُنفدت مقاعد العقد' }
  /* مخصِّص المقعد ليس صاحب الحساب: يملأ الاسم الفارغ فقط */
  const learner = await upsertLearner({ name: v.name.trim(), email: e.data, phone: '', org: '', vatNumber: '' })
  const [dup] = await db.select().from(s.enrollments).where(and(eq(s.enrollments.learnerId, learner.id), eq(s.enrollments.courseId, course.id), eq(s.enrollments.status, 'active')))
  if (dup && hasAccess(dup)) return { ok: false, error: 'هذا المشارك مسجّل في الدورة من قبل' }
  const cohortId = cohort?.id ?? null
  /* مقعد العقد مقعد حقيقي في الدفعة أو الدورة — إلا تجديد منتهٍ يبقى في دفعته */
  const keeps = !!dup && (!cohorts.length || dup.cohortId === cohortId)
  if (!keeps) {
    const room = await noRoom(course, cohort, 1)
    if (room) return { ok: false, error: cohort ? `${room} في «${cohort.title}»` : room }
  }
  const accessUntil = c.endsAt ? new Date(c.endsAt).toISOString() : await accessUntilOf(course.id, cohortId)
  const eid = dup?.id ?? randomUUID()
  if (dup) await db.update(s.enrollments).set({ contractId: c.id, cohortId, accessUntil, updatedAt: new Date().toISOString() }).where(eq(s.enrollments.id, dup.id))
  else await db.insert(s.enrollments).values({ id: eid, learnerId: learner.id, courseId: course.id, cohortId, source: 'seat', contractId: c.id, accessUntil })
  if ((await contractUsed(c.id)) > c.seats || (!keeps && (await overCapacity(course, cohort)))) {
    if (dup) await db.update(s.enrollments).set({ contractId: dup.contractId, cohortId: dup.cohortId, accessUntil: dup.accessUntil }).where(eq(s.enrollments.id, dup.id))
    else await db.delete(s.enrollments).where(eq(s.enrollments.id, eid))
    return { ok: false, error: 'استُنفدت المقاعد للتو — أعد المحاولة' }
  }
  /* يظهر الموظف في لوحة المؤسسة */
  await db.insert(s.orgMembers).values({ orgId: c.orgId, learnerId: learner.id, role: 'member' }).onConflictDoNothing()
  await audit(by, 'assign', 'contract', c.id, `مقعد ← ${learner.email} · ${course.title}`)
  const { onEnrolled } = await import('./notify/engine')
  await onEnrolled(eid)
  refreshPublicPages()
  return { ok: true }
}
