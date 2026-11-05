'use server'
/* الدفعات من اللوحة — حفظ الدفعة ومواعيد جلساتها، ونقل المتدرب بين الدفعات، وتمديد الوصول. */
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema as s } from '@/server/db'
import { requirePermission } from '@/server/auth'
import { audit } from '@/server/audit'
import { chunksOf, inList } from '@/server/db/limits'
import { cohortSeatsUsed } from '@/server/cohorts'
import { cohortInput, type CohortInput } from '@/admin/schemas'

const iso = z.string().datetime({ offset: true }).nullable()

type Result = { ok: true; id: string } | { ok: false; error: string }

const refresh = (courseId?: string) => {
  revalidatePath('/', 'layout')
  if (courseId) revalidatePath(`/admin/courses/${courseId}`)
}

/** دروس الدورة المباشرة والحضورية — وحدها لها مواعيد في الدفعة */
async function sessionLessonIds(courseId: string) {
  const mods = await db.select({ id: s.modules.id }).from(s.modules).where(eq(s.modules.courseId, courseId))
  if (!mods.length) return new Set<string>()
  const rows = await db.select({ id: s.lessons.id, type: s.lessons.type }).from(s.lessons).where(inList(s.lessons.moduleId, mods.map((m) => m.id)))
  return new Set(rows.filter((l) => l.type === 'live' || l.type === 'onsite').map((l) => l.id))
}

export async function saveCohort(courseId: string, id: string | null, raw: CohortInput): Promise<Result> {
  const st = await requirePermission('content.write')
  if (!z.string().uuid().safeParse(courseId).success || (id && !z.string().uuid().safeParse(id).success)) return { ok: false, error: 'طلب غير صالح' }
  const p = cohortInput.safeParse(raw)
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'بيانات غير صالحة' }
  const [course] = await db.select({ id: s.courses.id }).from(s.courses).where(and(eq(s.courses.id, courseId), isNull(s.courses.deletedAt)))
  if (!course) return { ok: false, error: 'الدورة غير موجودة' }
  const allowed = await sessionLessonIds(courseId)
  const { sessions, ...v } = p.data
  if (sessions.some((x) => !allowed.has(x.lessonId))) return { ok: false, error: 'جلسة لا تخصّ هذه الدورة — احفظ المنهج أولاً' }
  const cid = id ?? randomUUID()
  if (id) {
    const [old] = await db.select().from(s.cohorts).where(and(eq(s.cohorts.id, id), eq(s.cohorts.courseId, courseId)))
    if (!old) return { ok: false, error: 'الدفعة غير موجودة' }
    await db.update(s.cohorts).set({ ...v, updatedAt: new Date().toISOString() }).where(eq(s.cohorts.id, id))
  } else {
    const n = (await db.select({ id: s.cohorts.id }).from(s.cohorts).where(eq(s.cohorts.courseId, courseId))).length
    await db.insert(s.cohorts).values({ ...v, id: cid, courseId, sortOrder: n })
  }
  /* المواعيد تُحدَّث بمفتاح (الدفعة، الدرس) فيبقى التسجيل المرفوع للجلسة، ويُحذف ما أُفرغ موعده */
  const keep = sessions.filter((x) => x.startsAt || x.joinUrl || x.location)
  const old = await db.select().from(s.cohortSessions).where(eq(s.cohortSessions.cohortId, cid))
  const drop = old.filter((o) => !keep.some((k) => k.lessonId === o.lessonId)).map((o) => o.lessonId)
  if (drop.length) await db.delete(s.cohortSessions).where(and(eq(s.cohortSessions.cohortId, cid), inList(s.cohortSessions.lessonId, drop)))
  for (const k of keep) {
    const row = { ...k, cohortId: cid }
    await db.insert(s.cohortSessions).values(row).onConflictDoUpdate({
      target: [s.cohortSessions.cohortId, s.cohortSessions.lessonId],
      set: { startsAt: row.startsAt, endsAt: row.endsAt, joinUrl: row.joinUrl, location: row.location, updatedAt: new Date().toISOString() },
    })
  }
  await audit(st.name, id ? 'update' : 'create', 'cohort', cid, v.title, p.data)
  refresh(courseId)
  return { ok: true, id: cid }
}

/** دفعة جديدة من دفعة قائمة: المقاعد والمكان كما هي، ومواعيد الجلسات تُزاح بفارق بداية الدفعتين */
export async function cloneCohort(fromId: string, title: string, startsAt: string): Promise<Result> {
  const st = await requirePermission('content.write')
  if (!z.string().uuid().safeParse(fromId).success || !z.string().datetime({ offset: true }).safeParse(startsAt).success) return { ok: false, error: 'طلب غير صالح' }
  const t = z.string().trim().min(2).max(120).safeParse(title)
  if (!t.success) return { ok: false, error: 'اسم الدفعة مطلوب' }
  const [src] = await db.select().from(s.cohorts).where(eq(s.cohorts.id, fromId))
  if (!src) return { ok: false, error: 'الدفعة غير موجودة' }
  const shift = src.startsAt ? Date.parse(startsAt) - Date.parse(src.startsAt) : 0
  const move = (x: string | null) => (x ? new Date(Date.parse(x) + shift).toISOString() : null)
  const id = randomUUID()
  const n = (await db.select({ id: s.cohorts.id }).from(s.cohorts).where(eq(s.cohorts.courseId, src.courseId))).length
  await db.insert(s.cohorts).values({
    id, courseId: src.courseId, title: t.data, status: 'soon', startsAt, endsAt: src.endsAt && src.startsAt ? move(src.endsAt) : null,
    seatsTotal: src.seatsTotal, seatsTaken: 0, city: src.city, venue: src.venue, sortOrder: n,
  })
  const sess = await db.select().from(s.cohortSessions).where(eq(s.cohortSessions.cohortId, fromId))
  for (const part of chunksOf(s.cohortSessions, sess.map((x) => ({ cohortId: id, lessonId: x.lessonId, startsAt: move(x.startsAt), endsAt: move(x.endsAt), joinUrl: '', location: x.location }))))
    await db.insert(s.cohortSessions).values(part)
  /* من طلب إبلاغه بالدفعة القادمة يُبلَّغ بهذه حين تُفتح */
  await audit(st.name, 'create', 'cohort', id, `${t.data} — من «${src.title}»`)
  refresh(src.courseId)
  return { ok: true, id }
}

/** نقل تسجيل إلى دفعة أخرى من الدورة نفسها — التقدّم يبقى، والمقعد يُفحص ذرّياً (يتراجع النقل إن سبقه غيره) */
export async function transferEnrollment(enrollmentId: string, toCohortId: string): Promise<{ ok: boolean; error?: string }> {
  const st = await requirePermission('sales.orders')
  if (!z.string().uuid().safeParse(enrollmentId).success || !z.string().uuid().safeParse(toCohortId).success) return { ok: false, error: 'طلب غير صالح' }
  const [en] = await db.select().from(s.enrollments).where(eq(s.enrollments.id, enrollmentId))
  const [to] = await db.select().from(s.cohorts).where(and(eq(s.cohorts.id, toCohortId), isNull(s.cohorts.deletedAt)))
  if (!en || en.status !== 'active') return { ok: false, error: 'التسجيل غير نشط' }
  if (!to || to.courseId !== en.courseId) return { ok: false, error: 'الدفعة ليست من دورة هذا التسجيل' }
  if (en.cohortId === to.id) return { ok: false, error: 'المتدرب في هذه الدفعة بالفعل' }
  if (to.status === 'closed') return { ok: false, error: 'الدفعة مغلقة' }
  const from = en.cohortId
  await db.update(s.enrollments).set({ cohortId: to.id, updatedAt: new Date().toISOString() }).where(eq(s.enrollments.id, enrollmentId))
  if (to.seatsTotal !== null && (await cohortSeatsUsed(to)) > to.seatsTotal) {
    await db.update(s.enrollments).set({ cohortId: from }).where(eq(s.enrollments.id, enrollmentId))
    return { ok: false, error: `اكتملت مقاعد «${to.title}»` }
  }
  /* مقعد المؤسسة المخصّص ينتقل مع صاحبه */
  await db.update(s.seatGrants).set({ cohortId: to.id }).where(eq(s.seatGrants.enrollmentId, enrollmentId))
  await audit(st.name, 'transfer', 'enrollment', enrollmentId, `نقل إلى «${to.title}»`)
  const { onCohortTransfer } = await import('@/server/notify/engine')
  await onCohortTransfer(enrollmentId)
  refresh(en.courseId)
  return { ok: true }
}

/** تمديد الوصول (أو جعله دائماً بلا تاريخ) */
export async function setAccessUntil(enrollmentId: string, until: string | null): Promise<{ ok: boolean; error?: string }> {
  const st = await requirePermission('sales.orders')
  if (!z.string().uuid().safeParse(enrollmentId).success || !iso.safeParse(until).success) return { ok: false, error: 'طلب غير صالح' }
  const [en] = await db.select().from(s.enrollments).where(eq(s.enrollments.id, enrollmentId))
  if (!en) return { ok: false, error: 'التسجيل غير موجود' }
  await db.update(s.enrollments).set({ accessUntil: until, updatedAt: new Date().toISOString() }).where(eq(s.enrollments.id, enrollmentId))
  await audit(st.name, 'access', 'enrollment', enrollmentId, until ? `الوصول حتى ${until.slice(0, 10)}` : 'وصول دائم')
  refresh(en.courseId)
  return { ok: true }
}

/** الدفعات مع مواعيدها — لتبويب «الدفعات» في محرّر الدورة */
export async function cohortsForEdit(courseId: string) {
  await requirePermission('content.read')
  const rows = await db.select().from(s.cohorts).where(and(eq(s.cohorts.courseId, courseId), isNull(s.cohorts.deletedAt))).orderBy(asc(s.cohorts.sortOrder))
  const sess = rows.length ? await db.select().from(s.cohortSessions).where(inList(s.cohortSessions.cohortId, rows.map((r) => r.id))) : []
  const used = await Promise.all(rows.map((r) => cohortSeatsUsed(r)))
  return rows.map((r, i) => ({ row: r, used: used[i], sessions: sess.filter((x) => x.cohortId === r.id) }))
}
