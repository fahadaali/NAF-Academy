'use server'
/* إجراءات المتدرب داخل الدرس — كلها تتحقق من التسجيل وإتاحة الدرس على الخادم. */
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema as s } from '@/server/db'
import { currentLearner } from '@/server/learner-auth'
import { learnerCourse } from '@/server/learning'
import { gradeQuiz, publicQuiz } from '@/lib/learning'
import { putObject } from '@/server/storage'
import { limited } from '@/server/ratelimit'
import { EXT_MIME } from '@/lib/files'
import { onProgress } from '@/server/notify/engine'

/** يتحقق أن الدرس مفتوح لهذا المتدرب المسجّل */
async function gate(slug: string, lessonId: string) {
  const me = await currentLearner()
  if (!me) throw new Error('انتهت الجلسة')
  const ctx = await learnerCourse(slug, me)
  if (!ctx?.enrollment) throw new Error('غير مسجّل في الدورة')
  const lesson = ctx.ordered.find((l) => l.id === lessonId)
  const acc = ctx.modules.flatMap((m) => m.lessons).find((l) => l.id === lessonId)?.access
  if (!lesson || acc?.state !== 'open') throw new Error('الدرس غير متاح')
  return { me, ctx, lesson }
}

async function complete(learnerId: string, lessonId: string, courseId: string) {
  const now = new Date().toISOString()
  await db.insert(s.lessonProgress).values({ learnerId, lessonId, courseId, completedAt: now })
    .onConflictDoUpdate({ target: [s.lessonProgress.learnerId, s.lessonProgress.lessonId], set: { completedAt: sql`coalesce(${s.lessonProgress.completedAt}, ${now})`, updatedAt: now } })
  await onProgress(learnerId, courseId)
}

/** نبضة المشاهدة: الموضع، وثوانٍ مُشاهَدة من المحتوى.
   لا يُختصر الإكمال: القفز لا يُحتسب، والنبضة لا تتجاوز ما يسمح به الوقت الفعلي منذ سابقتها بأقصى سرعة (2×)،
   والمدة تُقيَّد بمدة الدرس المعلنة فلا يكفي إرسال مدة قصيرة. */
export async function saveProgress(slug: string, lessonId: string, position: number, delta: number, duration: number) {
  const { me, ctx, lesson } = await gate(slug, lessonId)
  const pos = Math.max(0, Math.floor(position))
  /* الحساب داخل الكتابة نفسها (ذرّياً): ما يُضاف لا يتجاوز ضعف الوقت الفعلي منذ آخر نبضة محفوظة —
     فالنبضات المتوازية أو المتلاحقة لا تقرأ الطابع نفسه ولا تكسب ثواني لم تمضِ */
  const add = Math.max(0, Math.min(30, Math.floor(Number(delta) || 0)))
  const m = lesson.minutes * 60
  const dur = m ? Math.min(m * 1.5, Math.max(m * 0.5, Math.floor(duration) || m)) : Math.max(60, Math.min(6 * 3600, Math.floor(duration) || 60))
  const now = new Date().toISOString()
  const [row] = await db.insert(s.lessonProgress).values({ learnerId: me.id, lessonId, courseId: ctx.course.id, positionSec: pos, watchedSec: Math.min(add, 24) })
    .onConflictDoUpdate({
      target: [s.lessonProgress.learnerId, s.lessonProgress.lessonId],
      set: {
        positionSec: pos,
        watchedSec: sql`${s.lessonProgress.watchedSec} + max(0, min(${add}, cast((julianday(${now}) - julianday(${s.lessonProgress.updatedAt})) * 172800 as integer)))`,
        updatedAt: now,
      },
    })
    .returning()
  if (!row.completedAt && lesson.type === 'video' && row.watchedSec >= (dur * ctx.course.completeAt) / 100) {
    await complete(me.id, lessonId, ctx.course.id)
    return { done: true }
  }
  return { done: !!row.completedAt }
}

/** إكمال يدوي — للمقالات والملفات فقط؛ الفيديو بالمشاهدة، والاختبار بالنجاح، والواجب بالقبول */
export async function markComplete(slug: string, lessonId: string) {
  const { me, ctx, lesson } = await gate(slug, lessonId)
  if (lesson.type !== 'article' && lesson.type !== 'file') return { ok: false }
  await complete(me.id, lessonId, ctx.course.id)
  revalidatePath(`/learn/${slug}`, 'layout')
  return { ok: true }
}

export async function listNotes(slug: string, lessonId: string) {
  const { me } = await gate(slug, lessonId)
  return db.select().from(s.notes).where(and(eq(s.notes.learnerId, me.id), eq(s.notes.lessonId, lessonId))).orderBy(s.notes.atSec, s.notes.createdAt)
}

export async function addNote(slug: string, lessonId: string, body: string, atSec: number | null) {
  const { me } = await gate(slug, lessonId)
  const text = body.trim().slice(0, 4000)
  if (!text) return { ok: false }
  await db.insert(s.notes).values({ id: randomUUID(), learnerId: me.id, lessonId, body: text, atSec: atSec === null ? null : Math.max(0, Math.floor(atSec)) })
  return { ok: true }
}

export async function deleteNote(slug: string, lessonId: string, id: string) {
  const { me } = await gate(slug, lessonId)
  await db.delete(s.notes).where(and(eq(s.notes.id, id), eq(s.notes.learnerId, me.id)))
}

export async function askQuestion(slug: string, lessonId: string, body: string) {
  if (await limited('ask', 10, 10 * 60e3)) return { ok: false, error: 'أسئلة كثيرة — انتظر قليلاً' }
  const { me, ctx } = await gate(slug, lessonId)
  const text = body.trim().slice(0, 3000)
  if (text.length < 5) return { ok: false, error: 'اكتب سؤالك' }
  await db.insert(s.questions).values({ id: randomUUID(), lessonId, courseId: ctx.course.id, learnerId: me.id, body: text })
  return { ok: true }
}

export async function listQuestions(slug: string, lessonId: string) {
  const { me } = await gate(slug, lessonId)
  /* المتدرب يرى أسئلته وإجاباتها، وكل سؤال أُجيب عنه في الدرس (بلا اسم صاحبه) */
  const rows = await db.select().from(s.questions).where(eq(s.questions.lessonId, lessonId)).orderBy(desc(s.questions.createdAt))
  return rows.filter((q) => q.learnerId === me.id || q.answer).map((q) => ({ id: q.id, body: q.body, answer: q.answer, mine: q.learnerId === me.id, at: q.createdAt }))
}

/* ───────── الاختبار ───────── */

export async function startQuiz(slug: string, lessonId: string) {
  const { me, lesson } = await gate(slug, lessonId)
  if (lesson.type !== 'quiz' || !lesson.quiz) return { ok: false, error: 'لا اختبار' }
  const attempts = await db.select().from(s.quizAttempts).where(and(eq(s.quizAttempts.learnerId, me.id), eq(s.quizAttempts.lessonId, lessonId)))
  const open = attempts.find((a) => !a.submittedAt)
  if (open) return { ok: true, id: open.id, startedAt: open.startedAt }
  if (lesson.quiz.attempts !== null && attempts.length >= lesson.quiz.attempts) return { ok: false, error: 'استنفدت المحاولات المتاحة' }
  if (attempts.some((a) => a.passed)) return { ok: false, error: 'اجتزت هذا الاختبار' }
  const id = randomUUID()
  const startedAt = new Date().toISOString()
  await db.insert(s.quizAttempts).values({ id, learnerId: me.id, lessonId, startedAt })
  return { ok: true, id, startedAt }
}

const answersSchema = z.record(z.string().max(40), z.array(z.string().max(40)).max(10))

export async function submitQuiz(slug: string, lessonId: string, raw: unknown) {
  const { me, ctx, lesson } = await gate(slug, lessonId)
  const answers = answersSchema.parse(raw)
  if (!lesson.quiz) return { ok: false as const, error: 'لا اختبار' }
  const [open] = await db.select().from(s.quizAttempts).where(and(eq(s.quizAttempts.learnerId, me.id), eq(s.quizAttempts.lessonId, lessonId), isNull(s.quizAttempts.submittedAt)))
  if (!open) return { ok: false as const, error: 'ابدأ المحاولة أولاً' }
  const late = lesson.quiz.timeLimitMin !== null && Date.now() - Date.parse(open.startedAt) > (lesson.quiz.timeLimitMin + 1) * 60e3
  const g = gradeQuiz(lesson.quiz, late ? {} : answers)
  const [saved] = await db.update(s.quizAttempts).set({ answers, scorePct: g.scorePct, passed: g.passed, submittedAt: new Date().toISOString() })
    .where(and(eq(s.quizAttempts.id, open.id), isNull(s.quizAttempts.submittedAt))).returning()
  if (!saved) return { ok: false as const, error: 'سُلّمت هذه المحاولة من قبل' }
  if (g.passed) await complete(me.id, lessonId, ctx.course.id)
  revalidatePath(`/learn/${slug}`, 'layout')
  return { ok: true as const, late, scorePct: g.scorePct, passed: g.passed, results: lesson.quiz.showAnswers ? g.results : Object.fromEntries(Object.entries(g.results).map(([k, v]) => [k, { correct: v.correct, right: [] as string[] }])) }
}

/** أسئلة المحاولة الحالية (بلا إجابات) — بالترتيب نفسه الذي رآه */
export async function quizQuestions(slug: string, lessonId: string) {
  const { me, lesson } = await gate(slug, lessonId)
  if (!lesson.quiz) return null
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(s.quizAttempts).where(and(eq(s.quizAttempts.learnerId, me.id), eq(s.quizAttempts.lessonId, lessonId), sql`${s.quizAttempts.submittedAt} is not null`))
  return publicQuiz(lesson.quiz, `${me.id}:${lessonId}:${n}`)
}

/* ───────── الواجب ───────── */


export async function submitAssignment(form: FormData): Promise<{ ok: boolean; error?: string }> {
  const slug = String(form.get('slug') ?? '')
  const lessonId = String(form.get('lessonId') ?? '')
  const { me, ctx, lesson } = await gate(slug, lessonId)
  if (lesson.type !== 'assignment' || !lesson.assignment) return { ok: false, error: 'لا واجب' }
  const file = form.get('file')
  if (!(file instanceof File) || !file.size) return { ok: false, error: 'أرفق ملف الواجب' }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!lesson.assignment.accept.includes(ext) || !EXT_MIME[ext]) return { ok: false, error: `الصيغ المقبولة: ${lesson.assignment.accept.join('، ')}` }
  if (file.size > lesson.assignment.maxSizeMb * 1024 * 1024) return { ok: false, error: `الحد الأقصى ${lesson.assignment.maxSizeMb} ميغابايت` }
  const [prev] = await db.select().from(s.submissions).where(and(eq(s.submissions.learnerId, me.id), eq(s.submissions.lessonId, lessonId), eq(s.submissions.status, 'accepted')))
  if (prev) return { ok: false, error: 'قُبل واجبك من قبل' }
  const id = randomUUID()
  const key = `sub-${id}.${ext}`
  await putObject(key, new Uint8Array(await file.arrayBuffer()), EXT_MIME[ext])
  await db.insert(s.assets).values({ id, key, name: file.name.slice(0, 200), mime: EXT_MIME[ext], size: file.size, scope: 'submission', ownerLearnerId: me.id })
  await db.insert(s.submissions).values({ id: randomUUID(), learnerId: me.id, lessonId, courseId: ctx.course.id, assetId: id, note: String(form.get('note') ?? '').slice(0, 3000) })
  revalidatePath(`/learn/${slug}`, 'layout')
  return { ok: true }
}

export async function mySubmissions(slug: string, lessonId: string) {
  const { me } = await gate(slug, lessonId)
  return db.select({ sub: s.submissions, name: s.assets.name }).from(s.submissions).leftJoin(s.assets, eq(s.assets.id, s.submissions.assetId))
    .where(and(eq(s.submissions.learnerId, me.id), eq(s.submissions.lessonId, lessonId))).orderBy(desc(s.submissions.createdAt))
}
