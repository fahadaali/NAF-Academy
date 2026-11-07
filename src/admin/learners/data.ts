import 'server-only'
/* دليل المتدربين وملف كل متدرب — قراءة فقط. المدفوعات والرسائل تُعرض بصلاحيتها (الصفحة تقرر). */
import { and, count, desc, eq, like, or, sql } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { courseScope, inScope, requirePermission } from '@/server/auth'
import { invitesOf } from '@/server/invites'
import { inList } from '@/server/db/limits'
import { progressOf } from '@/server/notify/engine'

export const PAGE_SIZE = 50

export async function learnersList(opts: { q?: string; course?: string; page?: number }) {
  const scope = await courseScope(await requirePermission('learners.read'))
  const q = (opts.q ?? '').trim().slice(0, 80)
  const like_ = `%${q.replace(/[%_]/g, '')}%`
  const where = and(
    q ? or(like(s.learners.name, like_), like(s.learners.email, like_.toLowerCase()), like(s.learners.phone, like_), like(s.learners.org, like_)) : undefined,
    opts.course ? sql`exists (select 1 from enrollments e where e.learner_id = ${s.learners.id} and e.course_id = ${opts.course} and e.status = 'active')` : undefined,
    /* المدرب: متدربو دوراته وحدها */
    scope === null ? undefined : sql`exists (select 1 from enrollments e where e.learner_id = ${s.learners.id} and e.course_id in (select value from json_each(${JSON.stringify(scope)})))`,
  )
  const page = Math.max(0, Math.floor(opts.page ?? 0))
  const [rows, [total], courses] = await Promise.all([
    db.select({
      l: s.learners,
      active: sql<number>`(select count(*) from enrollments e where e.learner_id = ${s.learners.id} and e.status = 'active')`,
      certs: sql<number>`(select count(*) from certificates c where c.learner_id = ${s.learners.id} and c.status = 'issued')`,
      lastEnrolled: sql<string | null>`(select max(e.created_at) from enrollments e where e.learner_id = ${s.learners.id})`,
    }).from(s.learners).where(where).orderBy(desc(s.learners.createdAt)).limit(PAGE_SIZE).offset(page * PAGE_SIZE),
    db.select({ n: count() }).from(s.learners).where(where),
    db.select({ id: s.courses.id, title: s.courses.title }).from(s.courses).where(sql`${s.courses.deletedAt} is null`).orderBy(s.courses.sortOrder),
  ])
  /* مرشّح الدورات: دورات المدرب وحدها */
  return { rows, total: total.n, page, courses: courses.filter((c) => scope === null || scope.includes(c.id)).map((c) => ({ id: c.id, title: c.title.replace(/~\d?/g, '') })) }
}

export async function learnerProfile(id: string) {
  const scope = await courseScope(await requirePermission('learners.read'))
  const [l] = await db.select().from(s.learners).where(eq(s.learners.id, id))
  if (!l) return null
  if (scope !== null) {
    const [mine] = await db.select({ id: s.enrollments.id }).from(s.enrollments).where(and(eq(s.enrollments.learnerId, id), inList(s.enrollments.courseId, scope)))
    if (!mine) return null
  }
  const [enrolls, orders, certs, orgs, interest, reviews, messages] = await Promise.all([
    db.select({ e: s.enrollments, title: s.courses.title, slug: s.courses.slug, tier: s.priceTiers.name, number: s.orders.number })
      .from(s.enrollments).innerJoin(s.courses, eq(s.courses.id, s.enrollments.courseId))
      .leftJoin(s.priceTiers, eq(s.priceTiers.id, s.enrollments.tierId)).leftJoin(s.orders, eq(s.orders.id, s.enrollments.orderId))
      .where(eq(s.enrollments.learnerId, id)).orderBy(desc(s.enrollments.createdAt)),
    db.select().from(s.orders).where(eq(s.orders.learnerId, id)).orderBy(desc(s.orders.createdAt)).limit(100),
    db.select().from(s.certificates).where(eq(s.certificates.learnerId, id)).orderBy(desc(s.certificates.updatedAt)),
    db.select({ o: s.organizations, role: s.orgMembers.role }).from(s.orgMembers).innerJoin(s.organizations, eq(s.organizations.id, s.orgMembers.orgId)).where(eq(s.orgMembers.learnerId, id)),
    db.select({ i: s.interest, title: s.courses.title }).from(s.interest).innerJoin(s.courses, eq(s.courses.id, s.interest.courseId)).where(eq(s.interest.email, l.email)).orderBy(desc(s.interest.createdAt)),
    db.select({ r: s.reviews, title: s.courses.title }).from(s.reviews).innerJoin(s.courses, eq(s.courses.id, s.reviews.courseId)).where(eq(s.reviews.learnerId, id)),
    db.select().from(s.messageLog).where(or(eq(s.messageLog.to, l.email), l.phone ? eq(s.messageLog.to, l.phone) : undefined)).orderBy(desc(s.messageLog.createdAt)).limit(60),
  ])
  /* المدرب: ما يخصّ دوراته وحدها من تسجيلات وشهادات واهتمام وتقييمات */
  const mine = (c: string) => scope === null || scope.includes(c)
  const enrollsIn = enrolls.filter((x) => mine(x.e.courseId))
  const prog = await progressOf(enrollsIn.filter((x) => x.e.status === 'active').map((x) => ({ learnerId: id, courseId: x.e.courseId })))
  return {
    learner: l,
    enrolls: enrollsIn.map((x) => ({ ...x, title: x.title.replace(/~\d?/g, ''), pct: prog.get(`${id}:${x.e.courseId}`)?.pct ?? null })),
    orders: scope === null ? orders : [], certs: certs.filter((c) => mine(c.courseId)), orgs: scope === null ? orgs : [],
    interest: interest.filter((x) => mine(x.i.courseId)).map((x) => ({ ...x, title: x.title.replace(/~\d?/g, '') })),
    reviews: reviews.filter((x) => mine(x.r.courseId)).map((x) => ({ ...x, title: x.title.replace(/~\d?/g, '') })), messages: scope === null ? messages : [],
  }
}

/** دعوات الدورة — لمن يقرأ متدربيها وفي نطاقه (بلا nonce: الرابط يُطلب بإجرائه وصلاحيته) */
export async function courseInvites(courseId: string) {
  const scope = await courseScope(await requirePermission('learners.read'))
  if (!inScope(scope, courseId)) return []
  return (await invitesOf(courseId)).map(({ nonce: _n, ...r }) => r)
}
