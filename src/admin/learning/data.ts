import 'server-only'
/* قراءات التعلّم للوحة — الواجبات، والأسئلة، والجلسات وحضورها. */
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { courseScope, inScope, requirePermission } from '@/server/auth'
import { inList } from '@/server/db/limits'

/** المدرب يرى دوراته وحدها — شرط يُضاف لكل قراءة */
const scoped = (scope: string[] | null) => (scope === null ? undefined : inList(s.courses.id, scope))

export async function submissionsQueue(status: 'submitted' | 'accepted' | 'revise' | 'all') {
  const scope = await courseScope(await requirePermission('learning.review'))
  return db.select({ sub: s.submissions, learner: s.learners, lesson: s.lessons.title, course: s.courses.title, slug: s.courses.slug, file: s.assets.name })
    .from(s.submissions)
    .innerJoin(s.learners, eq(s.learners.id, s.submissions.learnerId))
    .innerJoin(s.lessons, eq(s.lessons.id, s.submissions.lessonId))
    .innerJoin(s.courses, eq(s.courses.id, s.submissions.courseId))
    .leftJoin(s.assets, eq(s.assets.id, s.submissions.assetId))
    .where(and(isNull(s.courses.deletedAt), scoped(scope), status === 'all' ? undefined : eq(s.submissions.status, status)))
    .orderBy(status === 'submitted' ? asc(s.submissions.createdAt) : desc(s.submissions.createdAt)).limit(300)
}

export async function questionsQueue(open: boolean) {
  const scope = await courseScope(await requirePermission('learning.review'))
  return db.select({ q: s.questions, learner: s.learners.name, email: s.learners.email, lesson: s.lessons.title, course: s.courses.title })
    .from(s.questions)
    .innerJoin(s.learners, eq(s.learners.id, s.questions.learnerId))
    .innerJoin(s.lessons, eq(s.lessons.id, s.questions.lessonId))
    .innerJoin(s.courses, eq(s.courses.id, s.questions.courseId))
    .where(and(isNull(s.courses.deletedAt), scoped(scope), open ? isNull(s.questions.answer) : sql`${s.questions.answer} is not null`))
    .orderBy(open ? asc(s.questions.createdAt) : desc(s.questions.answeredAt)).limit(300)
}

export async function learningCounts() {
  const scope = await courseScope(await requirePermission('learning.review'))
  const by = (col: Parameters<typeof inList>[0]) => (scope === null ? undefined : inList(col, scope))
  const [[subs], [qs]] = await Promise.all([
    db.select({ n: count() }).from(s.submissions).where(and(eq(s.submissions.status, 'submitted'), by(s.submissions.courseId))),
    db.select({ n: count() }).from(s.questions).where(and(isNull(s.questions.answer), by(s.questions.courseId))),
  ])
  return { submissions: subs.n, questions: qs.n }
}

/** مجموعات الحضور لكل جلسة: كل دفعة بموعدها (صفّها، أو موعد الدرس إن لم يكن لها صفّ)، ومن ليس في دفعة بموعد الدرس —
    القاعدة نفسها في صفحات التعلّم (withSession). cohort: معرّف الدفعة، أو null لمن ليس في دفعة */
type Group = { cohort: string | null; label: string; startsAt: string | null; endsAt: string | null; recording: { provider: string } | null }
async function groupsOf(courseIds: string[], lessons: { id: string; startsAt: string | null; endsAt: string | null; recording: { provider: string } | null; courseId: string }[]) {
  const ks = courseIds.length ? await db.select().from(s.cohorts).where(and(inList(s.cohorts.courseId, courseIds), isNull(s.cohorts.deletedAt))) : []
  const rows = ks.length ? await db.select().from(s.cohortSessions).where(inList(s.cohortSessions.cohortId, ks.map((k) => k.id))) : []
  const noCohort = courseIds.length ? await db.select({ c: s.enrollments.courseId, n: count() }).from(s.enrollments)
    .where(and(inList(s.enrollments.courseId, courseIds), eq(s.enrollments.status, 'active'), isNull(s.enrollments.cohortId))).groupBy(s.enrollments.courseId) : []
  const loose = new Set(noCohort.filter((x) => x.n > 0).map((x) => x.c))
  const out = new Map<string, Group[]>()
  for (const l of lessons) {
    const mine = ks.filter((k) => k.courseId === l.courseId)
    const g: Group[] = mine.map((k) => {
      const x = rows.find((r) => r.cohortId === k.id && r.lessonId === l.id)
      return x ? { cohort: k.id, label: k.title, startsAt: x.startsAt, endsAt: x.endsAt, recording: x.recording } : { cohort: k.id, label: k.title, startsAt: l.startsAt, endsAt: l.endsAt, recording: l.recording }
    })
    if (!mine.length || loose.has(l.courseId)) g.push({ cohort: null, label: mine.length ? 'بلا دفعة' : '', startsAt: l.startsAt, endsAt: l.endsAt, recording: l.recording })
    out.set(l.id, g)
  }
  return out
}

/** الجلسات المباشرة والحضورية مع عدد المسجّلين والحاضرين — صفّ لكل دفعة بموعدها */
export async function sessionsList() {
  const scope = await courseScope(await requirePermission('attendance.mark'))
  const rows = await db.select({ l: s.lessons, courseId: s.courses.id, course: s.courses.title })
    .from(s.lessons).innerJoin(s.modules, eq(s.modules.id, s.lessons.moduleId)).innerJoin(s.courses, eq(s.courses.id, s.modules.courseId))
    .where(and(inArray(s.lessons.type, ['live', 'onsite']), isNull(s.courses.deletedAt), scoped(scope)))
  if (!rows.length) return []
  const courseIds = [...new Set(rows.map((r) => r.courseId))]
  const groups = await groupsOf(courseIds, rows.map((r) => ({ ...r.l, courseId: r.courseId })))
  const [enr, att] = await Promise.all([
    db.select({ courseId: s.enrollments.courseId, cohortId: s.enrollments.cohortId, n: count() }).from(s.enrollments)
      .where(and(inList(s.enrollments.courseId, courseIds), eq(s.enrollments.status, 'active'))).groupBy(s.enrollments.courseId, s.enrollments.cohortId),
    db.select({ lessonId: s.attendance.lessonId, cohortId: s.enrollments.cohortId, n: count() }).from(s.attendance)
      .innerJoin(s.enrollments, and(eq(s.enrollments.learnerId, s.attendance.learnerId), eq(s.enrollments.courseId, s.attendance.courseId), eq(s.enrollments.status, 'active')))
      .where(inList(s.attendance.lessonId, rows.map((r) => r.l.id))).groupBy(s.attendance.lessonId, s.enrollments.cohortId),
  ])
  const e = new Map(enr.map((x) => [`${x.courseId}:${x.cohortId ?? ''}`, x.n]))
  const a = new Map(att.map((x) => [`${x.lessonId}:${x.cohortId ?? ''}`, x.n]))
  return rows.flatMap((r) => (groups.get(r.l.id) ?? []).map((g) => ({
    id: r.l.id, key: `${r.l.id}:${g.cohort ?? ''}`, cohort: g.cohort, cohortLabel: g.label, title: r.l.title, type: r.l.type, startsAt: g.startsAt, course: r.course,
    enrolled: e.get(`${r.courseId}:${g.cohort ?? ''}`) ?? 0, attended: a.get(`${r.l.id}:${g.cohort ?? ''}`) ?? 0,
  }))).sort((x, y) => (x.startsAt ?? '9').localeCompare(y.startsAt ?? '9'))
}

/** قائمة الحضور لجلسة — لدفعة بعينها (cohort)، أو لمن ليس في دفعة ('none')، أو للجميع إن لم تُحدَّد */
export async function sessionRoster(lessonId: string, cohort?: string) {
  const scope = await courseScope(await requirePermission('attendance.mark'))
  const [row] = await db.select({ l: s.lessons, courseId: s.courses.id, course: s.courses.title })
    .from(s.lessons).innerJoin(s.modules, eq(s.modules.id, s.lessons.moduleId)).innerJoin(s.courses, eq(s.courses.id, s.modules.courseId)).where(eq(s.lessons.id, lessonId))
  if (!row || (row.l.type !== 'live' && row.l.type !== 'onsite') || !inScope(scope, row.courseId)) return null
  const [k] = cohort && cohort !== 'none' ? await db.select().from(s.cohorts).where(and(eq(s.cohorts.id, cohort), eq(s.cohorts.courseId, row.courseId))) : []
  const [x] = k ? await db.select().from(s.cohortSessions).where(and(eq(s.cohortSessions.cohortId, k.id), eq(s.cohortSessions.lessonId, lessonId))) : []
  const people = await db.select({ learner: s.learners, at: s.attendance.at, method: s.attendance.method, by: s.attendance.by })
    .from(s.enrollments).innerJoin(s.learners, eq(s.learners.id, s.enrollments.learnerId))
    .leftJoin(s.attendance, and(eq(s.attendance.learnerId, s.enrollments.learnerId), eq(s.attendance.lessonId, lessonId)))
    .where(and(eq(s.enrollments.courseId, row.courseId), eq(s.enrollments.status, 'active'),
      k ? eq(s.enrollments.cohortId, k.id) : cohort === 'none' ? isNull(s.enrollments.cohortId) : undefined)).orderBy(asc(s.learners.name))
  /* الموعد المعروض موعد الدفعة إن كانت */
  const lesson = x ? { ...row.l, startsAt: x.startsAt, endsAt: x.endsAt } : row.l
  return { lesson, course: row.course, courseId: row.courseId, cohort: k ?? null, people }
}

/** جلسات مباشرة انتهت بلا تسجيل (آخر 30 يوماً، بعد ثلاث ساعات من نهايتها) — البديل اليدوي حين لا يصل من Zoom */
export async function missingRecordings() {
  const scope = await courseScope(await requirePermission('attendance.mark'))
  const now = Date.now()
  const from = new Date(now - 30 * 864e5).toISOString()
  const due = (start: string | null, end: string | null) => {
    if (!start || start < from) return false
    const e = end ? Date.parse(end) : Date.parse(start) + 2 * 3600e3
    return e + 3 * 3600e3 < now
  }
  const own = await db.select({ l: s.lessons, courseId: s.courses.id, course: s.courses.title }).from(s.lessons)
    .innerJoin(s.modules, eq(s.modules.id, s.lessons.moduleId)).innerJoin(s.courses, eq(s.courses.id, s.modules.courseId))
    .where(and(eq(s.lessons.type, 'live'), isNull(s.courses.deletedAt), scoped(scope)))
  /* بالمجموعات نفسها في قائمة الجلسات: كل دفعة بموعدها وتسجيلها — فلا يُعدّ الدرس ناقصاً وتسجيله في دفعته، ولا العكس */
  const groups = await groupsOf([...new Set(own.map((r) => r.courseId))], own.map((r) => ({ ...r.l, courseId: r.courseId })))
  const none = (r: { provider: string } | null) => !r || r.provider === 'none'
  return own.flatMap((r) => (groups.get(r.l.id) ?? [])
    .filter((g) => none(g.recording) && due(g.startsAt, g.endsAt))
    .map((g) => ({ key: `${g.cohort ?? ''}:${r.l.id}`, title: r.l.title, course: r.course, courseId: r.courseId, startsAt: g.startsAt!, cohort: g.label, cohortId: g.cohort })))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
}
