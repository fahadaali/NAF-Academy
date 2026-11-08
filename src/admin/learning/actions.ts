'use server'
/* أدوات التعلّم في اللوحة — مرفقات الدروس، والرفع إلى Stream، ومراجعة الواجبات، والإجابة عن الأسئلة، والحضور.
   كل إجراء: صلاحية ← تحقق ← كتابة ← سجل ← إعادة توليد. */
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { and, eq, like, or } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema as s } from '@/server/db'
import { courseScope, inScope, requirePermission } from '@/server/auth'
import { audit } from '@/server/audit'
import { putObject } from '@/server/storage'
import { directUpload, registerWebhook, streamCaptionGenerate, streamCaptions, streamCaptionUpload, streamMock, streamState, tusCreate } from '@/server/stream'
import { refreshVideo, saveWebhook, trackUpload } from '@/server/stream-videos'
import { STREAM_UID } from '@/lib/stream-status'
import { BASIC_MAX } from '@/lib/tus'
import { siteUrl } from '@/server/site'
import { headers } from 'next/headers'
import { toVtt } from '@/lib/captions'
import { setZoomEnabled, zoomState } from '@/server/zoom'
import { readTicket } from '@/server/tickets'
import { EXT_MIME } from '@/lib/files'
import { onProgress } from '@/server/notify/engine'
import { formatDay, formatTime } from '@/lib/dates'
import { hasAccess, withSession } from '@/lib/cohorts'
import { sessionsOf } from '@/server/cohorts'

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

const uploadInput = z.object({
  /* الدرس الذي يُرفع له (قد يكون جديداً لم يُحفظ — فيُربط عند الحفظ) */
  lessonId: z.string().max(60).nullish(),
  name: z.string().trim().max(200).default(''),
  size: z.number().int().positive().max(30 * 1024 ** 3),
})

/** رابط رفع إلى Stream — طلب واحد للملف الصغير، وtus للكبير. يعود للمتصفح برابط الرفع ومعرّف الفيديو وحدهما (لا مفتاح) */
export async function streamUpload(raw: unknown): Promise<{ ok: true; uploadURL: string; uid: string; method: 'basic' | 'tus' } | { ok: false; error: string }> {
  const st = await requirePermission('content.write')
  const state = streamState()
  if (!state.configured) return { ok: false, error: state.problem }
  const p = uploadInput.safeParse(raw)
  if (!p.success) return { ok: false, error: 'بيانات الملف غير صالحة' }
  let lessonId: string | null = null
  if (p.data.lessonId) {
    const [l] = await db.select({ id: s.lessons.id, courseId: s.modules.courseId }).from(s.lessons).innerJoin(s.modules, eq(s.modules.id, s.lessons.moduleId)).where(eq(s.lessons.id, p.data.lessonId))
    if (l && !inScope(await courseScope(st), l.courseId)) return { ok: false, error: 'الدرس خارج نطاقك' }
    lessonId = l?.id ?? null
  }
  const host = (await headers()).get('host')
  const meta = { lessonId, name: p.data.name || 'فيديو', host }
  /* في محاكاة الاختبارات وحدها يمكن خفض حدّ tus لتجربته بملف صغير */
  const tusAbove = streamMock() && Number(process.env.STREAM_MOCK_TUS_ABOVE) > 0 ? Number(process.env.STREAM_MOCK_TUS_ABOVE) : BASIC_MAX
  const r = p.data.size > tusAbove ? await tusCreate({ ...meta, size: p.data.size }) : await directUpload(meta)
  if (!r) return { ok: false, error: 'تعذّر إنشاء رابط الرفع من Stream' }
  await trackUpload(r.uid, lessonId, meta.name)
  await audit(st.name, 'upload', 'stream', r.uid, meta.name)
  return { ok: true, uploadURL: r.uploadURL, uid: r.uid, method: r.method }
}

/** حالة فيديو في Stream — يسأل Stream ويحدّث السجل والدرس (لمؤشر المعالجة في اللوحة) */
export async function streamVideoStatus(uid: unknown): Promise<{ ok: true; status: string; pct: number; durationSeconds: number | null; error: string } | { ok: false; error: string }> {
  await requirePermission('content.read')
  if (typeof uid !== 'string' || !STREAM_UID.test(uid)) return { ok: false, error: 'معرّف غير صالح' }
  const info = await refreshVideo(uid)
  if (!info) return { ok: false, error: 'تعذّر السؤال عن الفيديو' }
  return { ok: true, status: info.status, pct: info.pct, durationSeconds: info.durationSeconds, error: info.error }
}

export async function streamStatus() {
  await requirePermission('content.read')
  return streamState()
}

/** تسجيل Webhook اكتمال المعالجة لدى Stream — السرّ يولّده Cloudflare ويُحفظ في القاعدة ولا يُعرض */
export async function enableStreamWebhook(): Promise<{ ok: boolean; error?: string }> {
  const st = await requirePermission('channels.manage')
  if (!streamState().configured) return { ok: false, error: streamState().problem }
  const base = siteUrl()
  if (!base || !/^https:\/\//.test(base) && !streamMock()) return { ok: false, error: 'SITE_URL غير صالح — Stream يحتاج رابطاً عاماً بـ https' }
  const url = `${base}/api/stream/webhook`
  const secret = await registerWebhook(url)
  if (!secret) return { ok: false, error: 'رفض Stream تسجيل الرابط' }
  await saveWebhook(secret, url)
  await audit(st.name, 'update', 'settings', 'stream_webhook', `إشعار Stream: ${url}`)
  revalidatePath('/admin/learning/sessions')
  return { ok: true }
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
  if (!hasAccess(en)) return { ok: false, error: 'انتهى وصول صاحب التذكرة إلى الدورة — يجدّده من صفحتها' }
  /* موعد الجلسة كما يراه صاحب التذكرة: موعد دفعته إن كان في دفعة */
  const l = withSession(row.l, await sessionsOf(en.cohortId))
  const ins = await db.insert(s.attendance).values({ learnerId: learner.id, lessonId: row.l.id, courseId: row.courseId, method: 'qr', by: st.name })
    .onConflictDoNothing().returning({ at: s.attendance.at })
  if (ins.length) {
    await audit(st.name, 'checkin', 'lesson', row.l.id, learner.email || learner.phone)
    await onProgress(learner.id, row.courseId)
  }
  revalidatePath('/admin/learning', 'layout')
  return {
    ok: true, already: !ins.length, name: learner.name, email: learner.email || learner.phone, lesson: row.l.title, course: row.course,
    when: l.startsAt ? `${formatDay(l.startsAt)} · ${formatTime(l.startsAt)}` : '',
  }
}

/** تسجيل الحضور يدوياً أو إلغاؤه (جلسة مباشرة أو حضورية) */
export async function setAttendance(learnerId: string, lessonId: string, present: boolean): Promise<{ ok: boolean; error?: string }> {
  const st = await requirePermission('attendance.mark')
  const [row] = await db.select({ type: s.lessons.type, courseId: s.modules.courseId }).from(s.lessons).innerJoin(s.modules, eq(s.modules.id, s.lessons.moduleId)).where(eq(s.lessons.id, lessonId))
  if (!row || (row.type !== 'live' && row.type !== 'onsite') || !inScope(await courseScope(st), row.courseId)) return { ok: false, error: 'ليست جلسة' }
  const [en] = await db.select().from(s.enrollments).where(and(eq(s.enrollments.learnerId, learnerId), eq(s.enrollments.courseId, row.courseId), eq(s.enrollments.status, 'active')))
  /* status لا hasAccess: الموظف يثبت حضوراً سابقاً ولو انتهى الوصول بعده */
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

/* ───────── الترجمات النصية ───────── */

/** ملف ترجمة (VTT أو SRT ← VTT) لفيديو برابط مباشر — يُخزَّن خاصاً ويُقدَّم لمن يحق له الدرس */
export async function uploadCaption(form: FormData): Promise<{ ok: true; caption: { lang: string; label: string; assetId: string } } | { ok: false; error: string }> {
  const st = await requirePermission('content.write')
  const file = form.get('file')
  const lang = String(form.get('lang') ?? '')
  const label = String(form.get('label') ?? '').trim().slice(0, 40)
  if (!(file instanceof File) || !file.size) return { ok: false, error: 'لم يُرفق ملف' }
  if (!/^[a-z]{2}$/.test(lang) || !label) return { ok: false, error: 'اختر اللغة' }
  if (file.size > 2 * 1024 * 1024) return { ok: false, error: 'ملف الترجمة حتى 2 ميغابايت' }
  const vtt = toVtt(await file.text())
  if (!vtt) return { ok: false, error: 'الملف ليس ترجمة WebVTT أو SRT صالحة' }
  const id = randomUUID()
  const key = `cap-${id}.vtt`
  const bytes = new TextEncoder().encode(vtt)
  await putObject(key, bytes, 'text/vtt')
  await db.insert(s.assets).values({ id, key, name: `${label}.vtt`, mime: 'text/vtt', size: bytes.length, scope: 'caption' })
  await audit(st.name, 'upload', 'asset', id, `ترجمة ${label}`)
  return { ok: true, caption: { lang, label, assetId: id } }
}

/** ترجمات فيديو Stream — قائمة، ورفع ملف، وتوليد آلي */
/** فيديو Stream من دروس دورات العضو؟ (المدرب محصور في دوراته) — والمدخلات بصيغتها */
const UID = /^[a-f0-9]{32}$/
const LANG = /^[a-z]{2}(-[A-Z]{2})?$/
async function uidAllowed(st: Awaited<ReturnType<typeof requirePermission>>, uid: string) {
  if (!UID.test(uid)) return false
  const scope = await courseScope(st)
  if (scope === null) return true
  const rows = await db.select({ c: s.modules.courseId }).from(s.lessons).innerJoin(s.modules, eq(s.modules.id, s.lessons.moduleId))
    .where(or(like(s.lessons.video, `%${uid}%`), like(s.lessons.recording, `%${uid}%`)))
  return rows.some((r) => scope.includes(r.c))
}

export async function streamCaptionsOf(uid: string) {
  const st = await requirePermission('content.read')
  if (!(await uidAllowed(st, uid))) return []
  return (await streamCaptions(uid)) ?? []
}
export async function streamCaptionAdd(form: FormData): Promise<{ ok: boolean; error?: string }> {
  const st = await requirePermission('content.write')
  const uid = String(form.get('uid') ?? '')
  const lang = String(form.get('lang') ?? '')
  const file = form.get('file')
  if (!streamState().configured) return { ok: false, error: streamState().problem }
  if (!LANG.test(lang) || !(await uidAllowed(st, uid))) return { ok: false, error: 'طلب غير صالح' }
  if (!(file instanceof File) || file.size > 2 * 1024 * 1024) return { ok: false, error: 'ملف ترجمة حتى 2 ميغابايت' }
  const vtt = toVtt(await file.text())
  if (!vtt) return { ok: false, error: 'الملف ليس ترجمة WebVTT أو SRT صالحة' }
  if (!(await streamCaptionUpload(uid, lang, vtt))) return { ok: false, error: 'رفض Stream الملف' }
  await audit(st.name, 'caption', 'stream', uid, lang)
  return { ok: true }
}
export async function streamCaptionAuto(uid: string, lang: string): Promise<{ ok: boolean; error?: string }> {
  const st = await requirePermission('content.write')
  if (!streamState().configured) return { ok: false, error: streamState().problem }
  if (!LANG.test(lang) || !(await uidAllowed(st, uid))) return { ok: false, error: 'طلب غير صالح' }
  if (!(await streamCaptionGenerate(uid, lang))) return { ok: false, error: 'تعذّر بدء التوليد — تأكد أن الفيديو اكتملت معالجته' }
  await audit(st.name, 'caption', 'stream', uid, `توليد ${lang}`)
  return { ok: true }
}

/** تفعيل إلحاق تسجيلات Zoom تلقائياً — مقفل حتى يُضاف سرّ الإشعارات */
export async function setZoom(enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  const st = await requirePermission('channels.manage')
  if (typeof enabled !== 'boolean') return { ok: false, error: 'بيانات غير صالحة' }
  if (enabled && !zoomState().configured) return { ok: false, error: zoomState().problem }
  /* التسجيل يُنسخ من Zoom إلى Stream — بلا Stream لن يُلحق أي تسجيل */
  if (enabled && !streamState().configured) return { ok: false, error: `اربط Cloudflare Stream أولاً — التسجيلات تُنسخ إليه (${streamState().problem})` }
  await setZoomEnabled(enabled)
  await audit(st.name, 'update', 'settings', 'zoom', enabled ? 'تسجيلات Zoom تلقائية' : 'تسجيلات Zoom موقوفة')
  revalidatePath('/admin/learning/sessions')
  return { ok: true }
}
