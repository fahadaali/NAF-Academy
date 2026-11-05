import 'server-only'
/* قراءات التعلّم للوحة — الواجبات، والأسئلة، والجلسات وحضورها. */
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { requirePermission } from '@/server/auth'

export async function submissionsQueue(status: 'submitted' | 'accepted' | 'revise' | 'all') {
  await requirePermission('learning.review')
  return db.select({ sub: s.submissions, learner: s.learners, lesson: s.lessons.title, course: s.courses.title, slug: s.courses.slug, file: s.assets.name })
    .from(s.submissions)
    .innerJoin(s.learners, eq(s.learners.id, s.submissions.learnerId))
    .innerJoin(s.lessons, eq(s.lessons.id, s.submissions.lessonId))
    .innerJoin(s.courses, eq(s.courses.id, s.submissions.courseId))
    .leftJoin(s.assets, eq(s.assets.id, s.submissions.assetId))
    .where(status === 'all' ? undefined : eq(s.submissions.status, status))
    .orderBy(status === 'submitted' ? asc(s.submissions.createdAt) : desc(s.submissions.createdAt)).limit(300)
}

export async function questionsQueue(open: boolean) {
  await requirePermission('learning.review')
  return db.select({ q: s.questions, learner: s.learners.name, email: s.learners.email, lesson: s.lessons.title, course: s.courses.title })
    .from(s.questions)
    .innerJoin(s.learners, eq(s.learners.id, s.questions.learnerId))
    .innerJoin(s.lessons, eq(s.lessons.id, s.questions.lessonId))
    .innerJoin(s.courses, eq(s.courses.id, s.questions.courseId))
    .where(open ? isNull(s.questions.answer) : sql`${s.questions.answer} is not null`)
    .orderBy(open ? asc(s.questions.createdAt) : desc(s.questions.answeredAt)).limit(300)
}

export async function learningCounts() {
  await requirePermission('learning.review')
  const [[subs], [qs]] = await Promise.all([
    db.select({ n: count() }).from(s.submissions).where(eq(s.submissions.status, 'submitted')),
    db.select({ n: count() }).from(s.questions).where(isNull(s.questions.answer)),
  ])
  return { submissions: subs.n, questions: qs.n }
}

/** الجلسات المباشرة والحضورية مع عدد المسجّلين والحاضرين */
export async function sessionsList() {
  await requirePermission('attendance.mark')
  const rows = await db.select({ l: s.lessons, courseId: s.courses.id, course: s.courses.title })
    .from(s.lessons).innerJoin(s.modules, eq(s.modules.id, s.lessons.moduleId)).innerJoin(s.courses, eq(s.courses.id, s.modules.courseId))
    .where(and(inArray(s.lessons.type, ['live', 'onsite']), isNull(s.courses.deletedAt)))
    .orderBy(asc(s.lessons.startsAt))
  if (!rows.length) return []
  const courseIds = [...new Set(rows.map((r) => r.courseId))]
  const [enr, att] = await Promise.all([
    db.select({ courseId: s.enrollments.courseId, n: count() }).from(s.enrollments).where(and(inArray(s.enrollments.courseId, courseIds), eq(s.enrollments.status, 'active'))).groupBy(s.enrollments.courseId),
    db.select({ lessonId: s.attendance.lessonId, n: count() }).from(s.attendance).where(inArray(s.attendance.lessonId, rows.map((r) => r.l.id))).groupBy(s.attendance.lessonId),
  ])
  const e = new Map(enr.map((x) => [x.courseId, x.n]))
  const a = new Map(att.map((x) => [x.lessonId, x.n]))
  return rows.map((r) => ({ id: r.l.id, title: r.l.title, type: r.l.type, startsAt: r.l.startsAt, course: r.course, enrolled: e.get(r.courseId) ?? 0, attended: a.get(r.l.id) ?? 0 }))
}

export async function sessionRoster(lessonId: string) {
  await requirePermission('attendance.mark')
  const [row] = await db.select({ l: s.lessons, courseId: s.courses.id, course: s.courses.title })
    .from(s.lessons).innerJoin(s.modules, eq(s.modules.id, s.lessons.moduleId)).innerJoin(s.courses, eq(s.courses.id, s.modules.courseId)).where(eq(s.lessons.id, lessonId))
  if (!row || (row.l.type !== 'live' && row.l.type !== 'onsite')) return null
  const people = await db.select({ learner: s.learners, at: s.attendance.at, method: s.attendance.method, by: s.attendance.by })
    .from(s.enrollments).innerJoin(s.learners, eq(s.learners.id, s.enrollments.learnerId))
    .leftJoin(s.attendance, and(eq(s.attendance.learnerId, s.enrollments.learnerId), eq(s.attendance.lessonId, lessonId)))
    .where(and(eq(s.enrollments.courseId, row.courseId), eq(s.enrollments.status, 'active'))).orderBy(asc(s.learners.name))
  return { lesson: row.l, course: row.course, people }
}
