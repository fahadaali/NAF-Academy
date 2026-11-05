import 'server-only'
/* قراءات التحليلات — الزيارات والتحويل والإيراد والإكمال ونقاط التوقف والاختبارات والتقييمات.
   الأيام بتوقيت الرياض (+03:00). */
import { and, asc, avg, count, eq, gte, inArray, isNotNull, isNull, sql, sum } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { requirePermission } from '@/server/auth'
import { progressOf } from '@/server/notify/engine'
import type { Quiz } from '@/lib/learning-types'
import { inList } from '@/server/db/limits'

const PAID = ['paid', 'partially_refunded', 'refunded'] as const
const riyadhDay = (col: unknown) => sql<string>`substr(datetime(${col}, '+3 hours'), 1, 10)`

export function daysBack(n: number) {
  const out: string[] = []
  const base = Date.now() + 3 * 3600e3
  for (let i = n - 1; i >= 0; i--) out.push(new Date(base - i * 864e5).toISOString().slice(0, 10))
  return out
}

export async function overview(range: number) {
  await requirePermission('analytics.read')
  const days = daysBack(range)
  const from = days[0]
  const fromIso = new Date(Date.parse(`${from}T00:00:00+03:00`)).toISOString()
  const [views, enr, rev, certs, ratings, activeEnr] = await Promise.all([
    db.select({ day: s.statsDaily.day, n: s.statsDaily.n }).from(s.statsDaily).where(and(eq(s.statsDaily.metric, 'view'), eq(s.statsDaily.key, '*'), gte(s.statsDaily.day, from))),
    db.select({ day: riyadhDay(s.enrollments.createdAt), n: count() }).from(s.enrollments).where(gte(s.enrollments.createdAt, fromIso)).groupBy(riyadhDay(s.enrollments.createdAt)),
    db.select({ day: riyadhDay(s.orders.paidAt), net: sql<number>`sum(${s.orders.total} - ${s.orders.refunded})` }).from(s.orders)
      .where(and(inArray(s.orders.status, [...PAID]), gte(s.orders.paidAt, fromIso))).groupBy(riyadhDay(s.orders.paidAt)),
    db.select({ n: count() }).from(s.certificates).where(and(eq(s.certificates.status, 'issued'), gte(s.certificates.issuedAt, fromIso))),
    db.select({ avg: avg(s.reviews.rating), n: count() }).from(s.reviews).where(eq(s.reviews.status, 'approved')),
    db.select({ learnerId: s.enrollments.learnerId, courseId: s.enrollments.courseId }).from(s.enrollments).where(eq(s.enrollments.status, 'active')),
  ])
  const prog = await progressOf(activeEnr)
  const pcts = [...prog.values()].map((p) => p.pct)
  const v = new Map(views.map((x) => [x.day, x.n]))
  const e = new Map(enr.map((x) => [x.day, x.n]))
  const r = new Map(rev.map((x) => [x.day, Number(x.net ?? 0)]))
  const series = days.map((d) => ({ day: d, views: v.get(d) ?? 0, enrollments: e.get(d) ?? 0, revenue: r.get(d) ?? 0 }))
  const tot = (k: 'views' | 'enrollments' | 'revenue') => series.reduce((a, x) => a + x[k], 0)
  return {
    series,
    kpi: {
      views: tot('views'), enrollments: tot('enrollments'), revenue: tot('revenue'), certificates: certs[0].n,
      rating: ratings[0].n ? Math.round(Number(ratings[0].avg) * 10) / 10 : null, ratings: ratings[0].n,
      completion: pcts.length ? Math.round((pcts.filter((p) => p >= 100).length / pcts.length) * 100) : 0,
      avgProgress: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0,
      active: pcts.length,
    },
  }
}

/** قمع التحويل وإنجاز المتدربين لكل دورة */
export async function perCourse(range: number) {
  await requirePermission('analytics.read')
  const from = daysBack(range)[0]
  const fromIso = new Date(Date.parse(`${from}T00:00:00+03:00`)).toISOString()
  const courses = await db.select().from(s.courses).where(isNull(s.courses.deletedAt)).orderBy(asc(s.courses.sortOrder))
  const [stats, orders, enr, certs, revs] = await Promise.all([
    db.select({ metric: s.statsDaily.metric, key: s.statsDaily.key, n: sum(s.statsDaily.n) }).from(s.statsDaily)
      .where(and(inArray(s.statsDaily.metric, ['course', 'checkout']), gte(s.statsDaily.day, from))).groupBy(s.statsDaily.metric, s.statsDaily.key),
    db.select({ courseId: s.orderItems.courseId, status: s.orders.status, n: count() }).from(s.orderItems).innerJoin(s.orders, eq(s.orders.id, s.orderItems.orderId))
      .where(gte(s.orders.createdAt, fromIso)).groupBy(s.orderItems.courseId, s.orders.status),
    db.select({ learnerId: s.enrollments.learnerId, courseId: s.enrollments.courseId, createdAt: s.enrollments.createdAt }).from(s.enrollments).where(eq(s.enrollments.status, 'active')),
    db.select({ courseId: s.certificates.courseId, n: count() }).from(s.certificates).where(eq(s.certificates.status, 'issued')).groupBy(s.certificates.courseId),
    db.select({ courseId: s.reviews.courseId, avg: avg(s.reviews.rating), n: count() }).from(s.reviews).where(eq(s.reviews.status, 'approved')).groupBy(s.reviews.courseId),
  ])
  const prog = await progressOf(enr)
  const st = (m: string, k: string) => Number(stats.find((x) => x.metric === m && x.key === k)?.n ?? 0)
  return courses.map((c) => {
    const o = orders.filter((x) => x.courseId === c.id)
    const e = enr.filter((x) => x.courseId === c.id)
    const p = e.map((x) => prog.get(`${x.learnerId}:${x.courseId}`)?.pct ?? 0)
    const rv = revs.find((x) => x.courseId === c.id)
    return {
      id: c.id, slug: c.slug, title: c.title.replace(/~\d/g, ''),
      views: st('course', c.slug), checkout: st('checkout', c.slug),
      orders: o.reduce((a, x) => a + x.n, 0), paid: o.filter((x) => (PAID as readonly string[]).includes(x.status)).reduce((a, x) => a + x.n, 0),
      newEnrolled: e.filter((x) => x.createdAt >= fromIso).length, enrolled: e.length,
      avgPct: p.length ? Math.round(p.reduce((a, b) => a + b, 0) / p.length) : 0, completed: p.filter((x) => x >= 100).length,
      certificates: certs.find((x) => x.courseId === c.id)?.n ?? 0,
      rating: rv?.n ? Math.round(Number(rv.avg) * 10) / 10 : null, ratings: rv?.n ?? 0,
    }
  })
}

/** نقاط التوقف: لكل درس كم وصله وكم أكمله، وأين توقف من لم يكمل */
export async function dropOff(courseId: string) {
  await requirePermission('analytics.read')
  const lessons = await db.select({ l: s.lessons }).from(s.lessons).innerJoin(s.modules, eq(s.modules.id, s.lessons.moduleId))
    .where(eq(s.modules.courseId, courseId)).orderBy(asc(s.modules.sortOrder), asc(s.lessons.sortOrder))
  const enr = await db.select({ learnerId: s.enrollments.learnerId }).from(s.enrollments).where(and(eq(s.enrollments.courseId, courseId), eq(s.enrollments.status, 'active')))
  const ids = enr.map((e) => e.learnerId)
  const [prog, att, attempts] = ids.length
    ? await Promise.all([
      db.select().from(s.lessonProgress).where(and(eq(s.lessonProgress.courseId, courseId), inList(s.lessonProgress.learnerId, ids))),
      db.select().from(s.attendance).where(and(eq(s.attendance.courseId, courseId), inList(s.attendance.learnerId, ids))),
      db.select().from(s.quizAttempts).where(and(inList(s.quizAttempts.lessonId, lessons.map((x) => x.l.id)), isNotNull(s.quizAttempts.submittedAt))),
    ])
    : [[], [], []]
  /* آخر درس لمسه كل متدرب لم يكمل */
  const total = lessons.length
  const doneBy = new Map<string, number>()
  for (const p of prog) if (p.completedAt) doneBy.set(p.learnerId, (doneBy.get(p.learnerId) ?? 0) + 1)
  for (const a of att) doneBy.set(a.learnerId, (doneBy.get(a.learnerId) ?? 0) + 1)
  const lastOf = new Map<string, { lessonId: string; at: string }>()
  for (const p of prog) {
    if ((doneBy.get(p.learnerId) ?? 0) >= total) continue
    const cur = lastOf.get(p.learnerId)
    if (!cur || p.updatedAt > cur.at) lastOf.set(p.learnerId, { lessonId: p.lessonId, at: p.updatedAt })
  }
  const stopped = new Map<string, number>()
  for (const v of lastOf.values()) stopped.set(v.lessonId, (stopped.get(v.lessonId) ?? 0) + 1)

  const rows = lessons.map(({ l }) => {
    const session = l.type === 'live' || l.type === 'onsite'
    const reached = session ? att.filter((a) => a.lessonId === l.id).length : prog.filter((p) => p.lessonId === l.id).length
    const done = session ? reached : prog.filter((p) => p.lessonId === l.id && p.completedAt).length
    return { id: l.id, title: l.title, type: l.type, reached, done, stopped: stopped.get(l.id) ?? 0 }
  })

  /* الاختبارات: المتوسط ونسبة النجاح وأصعب الأسئلة */
  const quizzes = lessons.filter(({ l }) => l.type === 'quiz' && l.quiz).map(({ l }) => {
    const q = l.quiz as Quiz
    const at = attempts.filter((a) => a.lessonId === l.id)
    const questions = q.questions.map((qq) => {
      const answered = at.filter((a) => a.answers[qq.id]?.length)
      const right = answered.filter((a) => {
        const g = [...(a.answers[qq.id] ?? [])].sort().join(',')
        return g === [...qq.correct].sort().join(',')
      }).length
      return { id: qq.id, prompt: qq.prompt, answered: answered.length, pct: answered.length ? Math.round((right / answered.length) * 100) : null }
    }).sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101))
    return {
      id: l.id, title: l.title, attempts: at.length,
      avg: at.length ? Math.round(at.reduce((x, a) => x + (a.scorePct ?? 0), 0) / at.length) : null,
      pass: at.length ? Math.round((at.filter((a) => a.passed).length / at.length) * 100) : null,
      hardest: questions.slice(0, 3),
    }
  })
  return { enrolled: ids.length, rows, quizzes }
}
