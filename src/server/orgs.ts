import 'server-only'
/* حسابات المؤسسات — الأعضاء: المضافون صراحة + كل متدرب بريده من نطاقات المؤسسة.
   مسؤول المؤسسة يرى تقدّم موظفيه وشهاداتهم، ويخصّص مقاعد طلباته الجماعية بنفسه. */
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { db, schema as s } from './db'
import { progressOf } from './notify/engine'

export const domainOf = (email: string) => email.split('@')[1]?.toLowerCase() ?? ''

/** المؤسسات التي يديرها هذا المتدرب */
export async function managedOrgs(learnerId: string) {
  return db.select({ o: s.organizations }).from(s.orgMembers).innerJoin(s.organizations, eq(s.organizations.id, s.orgMembers.orgId))
    .where(and(eq(s.orgMembers.learnerId, learnerId), eq(s.orgMembers.role, 'manager'), isNull(s.organizations.deletedAt)))
    .then((r) => r.map((x) => x.o))
}

export async function orgMembers(orgId: string) {
  const [o] = await db.select().from(s.organizations).where(eq(s.organizations.id, orgId))
  if (!o) return []
  const explicit = await db.select({ l: s.learners, role: s.orgMembers.role }).from(s.orgMembers).innerJoin(s.learners, eq(s.learners.id, s.orgMembers.learnerId)).where(eq(s.orgMembers.orgId, orgId))
  const byDomain = o.domains.length
    ? await db.select().from(s.learners).where(or(...o.domains.map((d) => sql`lower(${s.learners.email}) like ${'%@' + d.toLowerCase()}`)))
    : []
  const map = new Map<string, { l: typeof s.learners.$inferSelect; role: 'manager' | 'member'; viaDomain: boolean }>()
  for (const l of byDomain) map.set(l.id, { l, role: 'member', viaDomain: true })
  for (const x of explicit) map.set(x.l.id, { l: x.l, role: x.role, viaDomain: false })
  return [...map.values()]
}

/** لوحة المؤسسة: كل عضو بدوراته وتقدّمه وشهاداته، ومقاعد الطلبات الجماعية */
export async function orgOverview(orgId: string) {
  const members = await orgMembers(orgId)
  const ids = members.map((m) => m.l.id)
  const managers = members.filter((m) => m.role === 'manager').map((m) => m.l.id)
  /* الخصوصية: لا يرى المسؤول إلا الدورات التي رعتها المؤسسة (طلبات مسؤوليها) — لا ما اشتراه الموظف لنفسه */
  const sponsored = managers.length ? (await db.select({ id: s.orders.id }).from(s.orders).where(inArray(s.orders.learnerId, managers))).map((o) => o.id) : []
  const [enr, certs] = ids.length && sponsored.length
    ? await Promise.all([
      db.select({ e: s.enrollments, title: s.courses.title, slug: s.courses.slug }).from(s.enrollments).innerJoin(s.courses, eq(s.courses.id, s.enrollments.courseId))
        .where(and(inArray(s.enrollments.learnerId, ids), eq(s.enrollments.status, 'active'), inArray(s.enrollments.orderId, sponsored))),
      db.select().from(s.certificates).where(and(inArray(s.certificates.learnerId, ids), eq(s.certificates.status, 'issued'))),
    ])
    : [[], []]
  const certsSeen = certs.filter((c) => enr.some((x) => x.e.learnerId === c.learnerId && x.e.courseId === c.courseId))
  const prog = await progressOf(enr.map(({ e }) => ({ learnerId: e.learnerId, courseId: e.courseId })))
  /* الأعضاء الظاهرون: المسؤولون، ومن له دورة برعاية المؤسسة، ومن أُضيف صراحة */
  const rows = members.filter((m) => !m.viaDomain || enr.some((x) => x.e.learnerId === m.l.id)).map((m) => ({
    ...m,
    courses: enr.filter((x) => x.e.learnerId === m.l.id).map((x) => ({
      courseId: x.e.courseId, title: x.title.replace(/~\d/g, ''), pct: prog.get(`${m.l.id}:${x.e.courseId}`)?.pct ?? 0,
      last: prog.get(`${m.l.id}:${x.e.courseId}`)?.last ?? null,
      cert: certs.find((c) => c.learnerId === m.l.id && c.courseId === x.e.courseId)?.code ?? null,
    })),
  }))
  const seats = managers.length
    ? await db.select({ g: s.seatGrants, title: s.courses.title, number: s.orders.number }).from(s.seatGrants)
      .innerJoin(s.orders, eq(s.orders.id, s.seatGrants.orderId)).innerJoin(s.courses, eq(s.courses.id, s.seatGrants.courseId))
      .where(and(inArray(s.orders.learnerId, managers), inArray(s.orders.status, ['paid', 'partially_refunded']))).orderBy(desc(s.orders.createdAt))
    : []
  const enrolled = enr.length
  const completed = rows.reduce((a, r) => a + r.courses.filter((c) => c.pct >= 100).length, 0)
  return {
    rows, seats: seats.map((x) => ({ ...x.g, title: x.title.replace(/~\d/g, ''), number: x.number })),
    totals: { members: rows.length, enrolled, completed, certificates: certsSeen.length, avg: enrolled ? Math.round(rows.flatMap((r) => r.courses).reduce((a, c) => a + c.pct, 0) / enrolled) : 0 },
  }
}

/** هل المقعد من مقاعد هذه المؤسسة (طلب أحد مسؤوليها)؟ */
export async function seatBelongsTo(orgId: string, grantId: string) {
  const [r] = await db.select({ id: s.seatGrants.id }).from(s.seatGrants).innerJoin(s.orders, eq(s.orders.id, s.seatGrants.orderId))
    .innerJoin(s.orgMembers, and(eq(s.orgMembers.learnerId, s.orders.learnerId), eq(s.orgMembers.orgId, orgId), eq(s.orgMembers.role, 'manager')))
    .where(eq(s.seatGrants.id, grantId))
  return !!r
}
