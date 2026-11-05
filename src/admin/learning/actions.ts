'use server'
/* أدوات التعلّم في اللوحة — مرفقات الدروس، والرفع إلى Stream، ومراجعة الواجبات، والإجابة عن الأسئلة، والحضور.
   كل إجراء: صلاحية ← تحقق ← كتابة ← سجل ← إعادة توليد. */
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema as s } from '@/server/db'
import { courseScope, inScope, requirePermission } from '@/server/auth'
import { audit } from '@/server/audit'
import { putObject } from '@/server/storage'
import { directUpload, streamState } from '@/server/stream'
import { readTicket } from '@/server/tickets'
import { EXT_MIME } from '@/lib/files'
import { onProgress } from '@/server/notify/engine'
import { formatDay, formatTime } from '@/lib/dates'

const MAX = 25 * 1024 * 1024

/** مرفق درس — يُخزَّن خاصاً ولا يُنزَّل إلا للمسجّل أو لدرس معاينة */
export async function uploadLessonFile(form: FormData): Promise<{ ok: true; file: { assetId: string; name: string; size: number } } | { ok: false; error: string }> {
  const st = await requirePermission('content.write')
  const file = form.get('file')
  if (!(file instanceof File) || !file.size) return { ok: false, error: 'لم يُرفق ملف' }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!EXT_MIME[ext]) return { ok: false, error: `الصيغ المقبولة: ${Object.keys(EXT_MIME).join('، ')}` }
  if (file.size > MAX) return { ok: false, error: 'الحد الأقصى 25 ميغابايت' }
  const id = randomUUID()
  const key = `les-${id}.${ext}`
  await putObject(key, new Uint8Array(await file.arrayBuffer()), EXT_MIME[ext])
  const name = file.name.slice(0, 200)
  await db.insert(s.assets).values({ id, key, name, mime: EXT_MIME[ext], size: file.size, scope: 'lesson' })
  await audit(st.name, 'upload', 'asset', id, name)
  return { ok: true, file: { assetId: id, name, size: file.size } }
}

/** رابط رفع مباشر إلى Stream — مقفل حتى تُضاف المفاتيح */
export async function streamUpload(): Promise<{ ok: true; uploadURL: string; uid: string } | { ok: false; error: string }> {
  await requirePermission('content.write')
  const state = streamState()
  if (!state.configured) return { ok: false, error: state.problem }
  const r = await directUpload()
  return r ? { ok: true, ...r } : { ok: false, error: 'تعذّر إنشاء رابط الرفع من Stream' }
}

export async function streamStatus() {
  await requirePermission('content.read')
  return streamState()
}

const reviewInput = z.object({ id: z.string().uuid(), status: z.enum(['accepted', 'revise']), feedback: z.string().trim().max(5000) })

/** مراجعة واجب: قبول (يُكمل الدرس) أو طلب تعديل بملاحظات */
export async function reviewSubmission(raw: unknown): Promise<{ ok: boolean; error?: string }> {
  const st = await requirePermission('learning.review')
  const p = reviewInput.safeParse(raw)
  if (!p.success) return { ok: false, error: 'بيانات غير صالحة' }
  if (p.data.status === 'revise' && !p.data.feedback) return { ok: false, error: 'اكتب ملاحظاتك للمتدرب' }
  const [sub] = await db.select().from(s.submissions).where(eq(s.submissions.id, p.data.id))
  if (!sub || !inScope(await courseScope(st), sub.courseId)) return { ok: false, error: 'التسليم غير موجود' }
  const now = new Date().toISOString()
  await db.update(s.submissions).set({ status: p.data.status, feedback: p.data.feedback, reviewedBy: st.name, reviewedAt: now, updatedAt: now }).where(eq(s.submissions.id, sub.id))
  if (p.data.status === 'accepted') {
    await db.insert(s.lessonProgress).values({ learnerId: sub.learnerId, lessonId: sub.lessonId, courseId: sub.courseId, completedAt: now })
      .onConflictDoUpdate({ target: [s.lessonProgress.learnerId, s.lessonProgress.lessonId], set: { completedAt: now, updatedAt: now } })

    await onProgress(sub.learnerId, sub.courseId)
  }
  await audit(st.name, p.data.status === 'accepted' ? 'accept' : 'revise', 'submission', sub.id, p.data.feedback.slice(0, 120))
  revalidatePath('/admin/learning', 'layout')
  revalidatePath('/learn', 'layout')
  return { ok: true }
}

const answerInput = z.object({ id: z.string().uuid(), answer: z.string().trim().min(1, 'اكتب الإجابة').max(8000) })

export async function answerQuestion(raw: unknown): Promise<{ ok: boolean; error?: string }> {
  const st = await requirePermission('learning.review')
  const p = answerInput.safeParse(raw)
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'بيانات غير صالحة' }
  const [q] = await db.select({ courseId: s.questions.courseId }).from(s.questions).where(eq(s.questions.id, p.data.id))
  if (!q || !inScope(await courseScope(st), q.courseId)) return { ok: false, error: 'السؤال غير موجود' }
  const now = new Date().toISOString()
  const r = await db.update(s.questions).set({ answer: p.data.answer, answeredBy: st.name, answeredAt: now, updatedAt: now }).where(eq(s.questions.id, p.data.id)).returning({ id: s.questions.id })
  if (!r.length) return { ok: false, error: 'السؤال غير موجود' }
  await audit(st.name, 'answer', 'question', p.data.id, p.data.answer.slice(0, 120))
  revalidatePath('/admin/learning', 'layout')
  revalidatePath('/learn', 'layout')
  return { ok: true }
}

export type CheckIn =
  | { ok: true; already: boolean; name: string; email: string; lesson: string; course: string; when: string }
  | { ok: false; error: string }

/** مسح تذكرة الحضور عند الباب — يتحقق من التوقيع والتسجيل ونوع الجلسة */
export async function checkIn(token: string): Promise<CheckIn> {
  const st = await requirePermission('attendance.mark')
  const t = readTicket(String(token).trim())
  if (!t) return { ok: false, error: 'تذكرة غير صالحة' }
  const [row] = await db.select({ l: s.lessons, courseId: s.modules.courseId, course: s.courses.title }).from(s.lessons)
    .innerJoin(s.modules, eq(s.modules.id, s.lessons.moduleId)).innerJoin(s.courses, eq(s.courses.id, s.modules.courseId)).where(eq(s.lessons.id, t.lessonId))
  if (!row || row.l.type !== 'onsite' || !inScope(await courseScope(st), row.courseId)) return { ok: false, error: 'الجلسة غير موجودة' }
  const [learner] = await db.select().from(s.learners).where(eq(s.learners.id, t.learnerId))
  const [en] = learner ? await db.select().from(s.enrollments).where(and(eq(s.enrollments.learnerId, learner.id), eq(s.enrollments.courseId, row.courseId), eq(s.enrollments.status, 'active'))) : []
  if (!learner || !en) return { ok: false, error: 'صاحب التذكرة غير مسجّل في الدورة' }
  const ins = await db.insert(s.attendance).values({ learnerId: learner.id, lessonId: row.l.id, courseId: row.courseId, method: 'qr', by: st.name })
    .onConflictDoNothing().returning({ at: s.attendance.at })
  if (ins.length) {
    await audit(st.name, 'checkin', 'lesson', row.l.id, learner.email || learner.phone)
    await onProgress(learner.id, row.courseId)
  }
  revalidatePath('/admin/learning', 'layout')
  return {
    ok: true, already: !ins.length, name: learner.name, email: learner.email || learner.phone, lesson: row.l.title, course: row.course,
    when: row.l.startsAt ? `${formatDay(row.l.startsAt)} · ${formatTime(row.l.startsAt)}` : '',
  }
}

/** تسجيل الحضور يدوياً أو إلغاؤه (جلسة مباشرة أو حضورية) */
export async function setAttendance(learnerId: string, lessonId: string, present: boolean): Promise<{ ok: boolean; error?: string }> {
  const st = await requirePermission('attendance.mark')
  const [row] = await db.select({ type: s.lessons.type, courseId: s.modules.courseId }).from(s.lessons).innerJoin(s.modules, eq(s.modules.id, s.lessons.moduleId)).where(eq(s.lessons.id, lessonId))
  if (!row || (row.type !== 'live' && row.type !== 'onsite') || !inScope(await courseScope(st), row.courseId)) return { ok: false, error: 'ليست جلسة' }
  const [en] = await db.select().from(s.enrollments).where(and(eq(s.enrollments.learnerId, learnerId), eq(s.enrollments.courseId, row.courseId), eq(s.enrollments.status, 'active')))
  if (!en) return { ok: false, error: 'غير مسجّل' }
  if (present) {
    await db.insert(s.attendance).values({ learnerId, lessonId, courseId: row.courseId, method: 'manual', by: st.name }).onConflictDoNothing()
    await onProgress(learnerId, row.courseId)
  }
  else await db.delete(s.attendance).where(and(eq(s.attendance.learnerId, learnerId), eq(s.attendance.lessonId, lessonId)))
  await audit(st.name, present ? 'attend' : 'unattend', 'lesson', lessonId, learnerId)
  revalidatePath('/admin/learning', 'layout')
  return { ok: true }
}
