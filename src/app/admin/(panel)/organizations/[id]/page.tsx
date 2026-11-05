import { notFound } from 'next/navigation'
import { and, asc, eq, isNull, ne } from 'drizzle-orm'
import { orgContracts } from '@/server/contracts'
import { ContractsPanel, type ContractItem } from '@/admin/corporate/ContractsPanel'
import { inList } from '@/server/db/limits'
import { db, schema as s } from '@/server/db'
import { requirePermission } from '@/server/auth'
import { orgOverview } from '@/server/orgs'
import { MemberForm, OrgForm, RemoveMember } from '@/admin/corporate/Corporate'
import { PageHead, Section } from '@/admin/ui/kit'
import p from '@/admin/ui/panel.module.css'
import c from '@/admin/corporate/corporate.module.css'
import { cohortState } from '@/lib/cohorts'

export default async function Organization({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('corporate.manage')
  const { id } = await params
  if (id === 'new') return (<><PageHead title="مؤسسة جديدة" /><Section title="البيانات"><OrgForm id={null} initial={{ name: '', domains: [], notes: '' }} /></Section></>)
  const [o] = await db.select().from(s.organizations).where(and(eq(s.organizations.id, id), isNull(s.organizations.deletedAt)))
  if (!o) notFound()
  const v = await orgOverview(id)
  const free = v.seats.filter((x) => !x.enrollmentId).length
  /* العقود ومقاعدها المخصّصة، والدورات بدفعاتها للتخصيص */
  const cs = await orgContracts(id)
  const seatRows = cs.length ? await db.select({ id: s.enrollments.id, contractId: s.enrollments.contractId, email: s.learners.email, name: s.learners.name, course: s.courses.title })
    .from(s.enrollments).innerJoin(s.learners, eq(s.learners.id, s.enrollments.learnerId)).innerJoin(s.courses, eq(s.courses.id, s.enrollments.courseId))
    .where(and(inList(s.enrollments.contractId, cs.map((x) => x.row.id)), eq(s.enrollments.status, 'active'))) : []
  const items: ContractItem[] = cs.map((x) => ({ ...x, file: x.row.fileId ? `/admin/files/${x.row.fileId}` : null, seats: seatRows.filter((r) => r.contractId === x.row.id).map((r) => ({ id: r.id, email: r.email, name: r.name, course: r.course.replace(/~\d/g, '') })) }))
  const [courseRows, cohortRows] = await Promise.all([
    /* ما يقبله التخصيص فعلاً: لا مسودات ولا مؤرشفة، ودفعات لم تنتهِ ولم تُغلق (assignContractSeat يرفض غيرها) */
    db.select({ id: s.courses.id, title: s.courses.title }).from(s.courses).where(and(isNull(s.courses.deletedAt), ne(s.courses.status, 'archived'), ne(s.courses.status, 'draft'))).orderBy(asc(s.courses.sortOrder)),
    db.select().from(s.cohorts).where(and(isNull(s.cohorts.deletedAt), ne(s.cohorts.status, 'closed'))),
  ])
  const liveCohorts = cohortRows.filter((k) => cohortState({ ...k, taken: 0 }) !== 'closed').map((k) => ({ id: k.id, title: k.title, courseId: k.courseId }))
  const courses = courseRows.map((x) => ({ ...x, cohorts: liveCohorts.filter((k) => k.courseId === x.id) }))
  return (
    <>
      <PageHead title={o.name} sub={`${v.totals.members} عضو ظاهر · ${v.totals.enrolled} تسجيل برعاية المؤسسة · ${free} مقعد غير مخصّص`} actions={<a className="btn ghost" href="/admin/organizations">المؤسسات</a>} />
      <Section title="البيانات"><OrgForm id={id} initial={{ name: o.name, domains: o.domains, notes: o.notes }} /></Section>
      <Section title="الأعضاء والمسؤولون" desc="المسؤول يرى لوحة المؤسسة في «حسابي» بعد الدخول ببريده">
        <MemberForm orgId={id} />
        {v.rows.length > 0 && (
          <div className={p.scroll}><table className={p.table}>
            <thead><tr><th>العضو</th><th>الدور</th><th>الدورات برعاية المؤسسة</th><th /></tr></thead>
            <tbody>{v.rows.map((m) => (
              <tr key={m.l.id}>
                <td><strong>{m.l.name}</strong><div className={`${p.muted} ${p.ltr}`}>{m.l.email}</div></td>
                <td>{m.role === 'manager' ? 'مسؤول' : m.viaDomain ? 'عضو (بالنطاق)' : 'عضو'}</td>
                <td>{m.courses.length ? m.courses.map((x) => <div key={x.courseId} className="num"><span className={c.bar}><i style={{ transform: `scaleX(${x.pct / 100})` }} /></span>{x.pct}% · {x.title}{x.cert ? ' · ✓ شهادة' : ''}</div>) : <span className={p.muted}>—</span>}</td>
                <td>{!m.viaDomain && <RemoveMember orgId={id} learnerId={m.l.id} />}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Section>
      <ContractsPanel orgId={id} items={items} courses={courses} />
      <Section title="المقاعد" desc="من الطلبات الجماعية لمسؤولي المؤسسة">
        {v.seats.length === 0 ? <p className={p.muted}>لا مقاعد بعد.</p> : (
          <div className={p.scroll}><table className={p.table}>
            <thead><tr><th>الدورة</th><th>الطلب</th><th>المخصّص له</th></tr></thead>
            <tbody>{v.seats.map((x) => <tr key={x.id}><td>{x.title}</td><td className="num"><a href={`/admin/orders/${x.orderId}`}>{x.number}</a></td><td className={p.ltr}>{x.email ?? '— متاح'}</td></tr>)}</tbody>
          </table></div>
        )}
      </Section>
    </>
  )
}
