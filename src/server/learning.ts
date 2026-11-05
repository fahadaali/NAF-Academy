import 'server-only'
/* خدمة التعلّم — تجمع الدورة للمتدرب مع حالة كل درس، ولا تُخرج إلا ما يحق له رؤيته:
   رابط الجلسة لا يظهر إلا للمسجّل في نافذتها، وإجابات الاختبار لا تخرج قبل التسليم. */
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import { db, schema as s } from './db'
import { availability, joinWindow, progressPct, publicQuiz, type Availability, type JoinState } from '@/lib/learning'
import type { LessonFull, LearnerRow } from './db/schema'
import type { PublicQuiz } from '@/lib/learning-types'
import { playbackUrl } from './stream'
import { ticketToken } from './tickets'

export type LessonState = { id: string; title: string; type: LessonFull['type']; minutes: number; preview: boolean; access: Availability; done: boolean; startsAt: string | null }
export type ModuleState = { id: string; title: string; lessons: LessonState[] }

const completable = (l: { type: string }) => l.type !== 'live' && l.type !== 'onsite'

/** الدورة للمتدرب: التسجيل، والمنهج بالحالات، والتقدّم */
export async function learnerCourse(slug: string, learner: LearnerRow | null) {
  const [course] = await db.select().from(s.courses).where(and(eq(s.courses.slug, slug), isNull(s.courses.deletedAt)))
  if (!course) return null
  const [enrollment] = learner
    ? await db.select().from(s.enrollments).where(and(eq(s.enrollments.learnerId, learner.id), eq(s.enrollments.courseId, course.id), eq(s.enrollments.status, 'active')))
    : []
  const mods = await db.select().from(s.modules).where(eq(s.modules.courseId, course.id)).orderBy(asc(s.modules.sortOrder))
  const lessons = mods.length ? await db.select().from(s.lessons).where(inArray(s.lessons.moduleId, mods.map((m) => m.id))).orderBy(asc(s.lessons.sortOrder)) : []
  const ordered = mods.flatMap((m) => lessons.filter((l) => l.moduleId === m.id))
  const prog = learner ? await db.select().from(s.lessonProgress).where(and(eq(s.lessonProgress.learnerId, learner.id), eq(s.lessonProgress.courseId, course.id))) : []
  const att = learner ? await db.select().from(s.attendance).where(and(eq(s.attendance.learnerId, learner.id), eq(s.attendance.courseId, course.id))) : []
  const done = new Set([...prog.filter((p) => p.completedAt).map((p) => p.lessonId), ...att.map((a) => a.lessonId)])
  const acc = availability(ordered.map((l) => ({ id: l.id, type: l.type, drip: l.drip, preview: l.preview, startsAt: l.startsAt })), {
    enrolledAt: enrollment?.createdAt ?? null, sequential: course.sequential, completed: done,
  })
  const modules: ModuleState[] = mods.map((m) => ({
    id: m.id, title: m.title,
    lessons: ordered.filter((l) => l.moduleId === m.id).map((l) => ({
      id: l.id, title: l.title, type: l.type, minutes: l.minutes, preview: l.preview, access: acc.get(l.id)!, done: done.has(l.id), startsAt: l.startsAt,
    })),
  }))
  const pct = progressPct(ordered.map((l) => l.id), done)
  const last = prog.filter((p) => !p.completedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  const nextUp = ordered.find((l) => acc.get(l.id)?.state === 'open' && !done.has(l.id) && completable(l))
  const upcoming = ordered.filter((l) => (l.type === 'live' || l.type === 'onsite') && l.startsAt && joinWindow(l.startsAt, l.endsAt).state !== 'ended')
  return { course, enrollment: enrollment ?? null, modules, ordered, pct, done, resumeId: last?.lessonId ?? nextUp?.id ?? ordered[0]?.id ?? null, upcoming }
}

export type LessonView = {
  lesson: Omit<LessonFull, 'quiz' | 'joinUrl' | 'video' | 'recording'>
  access: Availability
  enrolled: boolean
  player: { kind: 'stream' | 'url' | 'none'; src: string | null; resumeAt: number; duration: number }
  recording: { kind: 'stream' | 'url'; src: string } | null
  join: JoinState
  quiz: (PublicQuiz & { attemptId: string; used: number; best: number | null; lastPassed: boolean | null }) | null
  ticket: string | null
  attended: boolean
  done: boolean
}

/** الدرس الواحد — يُعاد null إن لم يحق للزائر فتحه */
export async function lessonView(slug: string, lessonId: string, learner: LearnerRow | null): Promise<(LessonView & { ctx: NonNullable<Awaited<ReturnType<typeof learnerCourse>>> }) | null> {
  const ctx = await learnerCourse(slug, learner)
  if (!ctx) return null
  const l = ctx.ordered.find((x) => x.id === lessonId)
  if (!l) return null
  const access = ctx.modules.flatMap((m) => m.lessons).find((x) => x.id === lessonId)!.access
  const enrolled = !!ctx.enrollment
  if (access.state === 'enroll') return null

  const [prog] = learner ? await db.select().from(s.lessonProgress).where(and(eq(s.lessonProgress.learnerId, learner.id), eq(s.lessonProgress.lessonId, l.id))) : []
  const resumeAt = prog && !prog.completedAt ? prog.positionSec : 0
  let player: LessonView['player'] = { kind: 'none', src: null, resumeAt, duration: l.minutes * 60 }
  if (access.state === 'open' && l.type === 'video') {
    if (l.video.provider === 'stream') player = { ...player, kind: 'stream', src: await playbackUrl(l.video.uid, resumeAt) }
    if (l.video.provider === 'url') player = { ...player, kind: 'url', src: l.video.url }
  }
  let recording: LessonView['recording'] = null
  if (enrolled && l.recording && l.recording.provider !== 'none') {
    const src = l.recording.provider === 'stream' ? await playbackUrl(l.recording.uid) : l.recording.url
    if (src) recording = { kind: l.recording.provider, src }
  }
  let quiz: LessonView['quiz'] = null
  if (l.type === 'quiz' && l.quiz && enrolled && access.state === 'open' && learner) {
    const attempts = await db.select().from(s.quizAttempts).where(and(eq(s.quizAttempts.learnerId, learner.id), eq(s.quizAttempts.lessonId, l.id))).orderBy(desc(s.quizAttempts.startedAt))
    const used = attempts.filter((a) => a.submittedAt).length
    const open = attempts.find((a) => !a.submittedAt)
    const best = attempts.reduce<number | null>((m, a) => (a.scorePct !== null && (m === null || a.scorePct > m) ? a.scorePct : m), null)
    /* البذرة رقم المحاولة — الترتيب ثابت داخل المحاولة ويتغيّر في التي بعدها */
    const attemptId = open?.id ?? ''
    quiz = { ...publicQuiz(l.quiz, `${learner.id}:${l.id}:${used}`), attemptId, used, best, lastPassed: attempts.find((a) => a.submittedAt)?.passed ?? null }
  }
  const [att] = learner ? await db.select().from(s.attendance).where(and(eq(s.attendance.learnerId, learner.id), eq(s.attendance.lessonId, l.id))) : []
  const { quiz: _q, joinUrl: _j, video: _v, recording: _r, ...safe } = l
  return {
    ctx, lesson: safe, access, enrolled, player, recording, quiz,
    join: joinWindow(l.startsAt, l.endsAt),
    ticket: enrolled && learner && l.type === 'onsite' ? ticketToken(learner.id, l.id) : null,
    attended: !!att, done: ctx.done.has(l.id),
  }
}
