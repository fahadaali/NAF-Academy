import { notFound } from 'next/navigation'
import { currentLearner } from '@/server/learner-auth'
import { managedOrgs, orgOverview } from '@/server/orgs'
import { formatDay } from '@/lib/dates'
import { OrgSeat } from '@/site/learn/OrgSeat'
import { OrgContractSeat } from '@/site/learn/OrgContractSeat'
import { inContract, orgContracts } from '@/server/contracts'
import { and, asc, isNull, ne } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import st from '@/site/learn/learn.module.css'

export default async function OrgDashboard() {
  const me = (await currentLearner())!
  const orgs = await managedOrgs(me.id)
  if (!orgs.length) notFound()
  const views = await Promise.all(orgs.map(async (o) => ({ o, v: await orgOverview(o.id), contracts: (await orgContracts(o.id)).filter((c) => c.state === 'active' || c.state === 'upcoming') })))
  const [courseRows, cohortRows] = await Promise.all([
    db.select({ id: s.courses.id, title: s.courses.title, visibility: s.courses.visibility }).from(s.courses).where(and(isNull(s.courses.deletedAt), ne(s.courses.status, 'archived'), ne(s.courses.status, 'draft'))).orderBy(asc(s.courses.sortOrder)),
    db.select({ id: s.cohorts.id, title: s.cohorts.title, courseId: s.cohorts.courseId }).from(s.cohorts).where(and(isNull(s.cohorts.deletedAt), ne(s.cohorts.status, 'closed'))),
  ])
  const courses = courseRows.map((x) => ({ ...x, cohorts: cohortRows.filter((k) => k.courseId === x.id) }))
  return (
    <div style={{ display: 'grid', gap: 26 }}>
      {views.map(({ o, v, contracts }) => (
        <section key={o.id} className={st.course} aria-labelledby={`org-${o.id}`}>
          <h2 id={`org-${o.id}`}>{o.name}</h2>
          <div className={`${st.orgStats} num`}>
            <div><strong>{v.totals.members}</strong><span>موظف</span></div>
            <div><strong>{v.totals.enrolled}</strong><span>تسجيل</span></div>
            <div><strong>{v.totals.avg}%</strong><span>متوسط الإنجاز</span></div>
            <div><strong>{v.totals.completed}</strong><span>دورة مكتملة</span></div>
            <div><strong>{v.totals.certificates}</strong><span>شهادة</span></div>
          </div>
          <p className={st.soon}>تظهر هنا الدورات التي رعتها مؤسستكم فقط — لا ما يشتريه الموظف لنفسه.</p>
          <table className={st.table}>
            <thead><tr><th>الموظف</th><th>الدورة</th><th>الإنجاز</th><th>آخر نشاط</th><th>الشهادة</th></tr></thead>
            <tbody>{v.rows.flatMap((m) => m.courses.length ? m.courses.map((c, i) => (
              <tr key={`${m.l.id}-${c.courseId}`}>
                <td>{i === 0 && <><strong>{m.l.name}</strong><small dir="ltr">{m.l.email}</small></>}</td>
                <td>{c.title}</td>
                <td className="num"><span className={st.mini}><i style={{ transform: `scaleX(${c.pct / 100})` }} /></span>{c.pct}%</td>
                <td className="num">{c.last ? formatDay(c.last) : '—'}</td>
                <td>{c.cert ? <a href={`/certificates/${c.cert}`}>عرض ✓</a> : '—'}</td>
              </tr>
            )) : [])}</tbody>
          </table>
          {contracts.map((c) => (
            <div key={c.row.id} className={st.contract}>
              <h3 className={st.h3}>{c.row.title} <small className="num">({c.used} من {c.row.seats} مقعد{c.row.endsAt ? ` · حتى ${formatDay(c.row.endsAt)}` : ''})</small></h3>
              {c.state === 'active' && c.used < c.row.seats
                ? <OrgContractSeat orgId={o.id} contractId={c.row.id} courses={courses.filter((x) => inContract(c.row, x))} />
                : <p className={st.soon}>{c.state === 'upcoming' ? 'يبدأ العقد لاحقاً.' : 'خُصّصت كل مقاعد العقد.'}</p>}
            </div>
          ))}
          {v.seats.length > 0 && (
            <>
              <h3 className={st.h3}>المقاعد <small className="num">({v.seats.filter((x) => !x.enrollmentId).length} متاح من {v.seats.length})</small></h3>
              <ul role="list" className={st.seats}>
                {v.seats.map((x) => (
                  <li key={x.id}>
                    <span><strong>{x.title}</strong><small className="num">{x.number}</small></span>
                    {x.enrollmentId ? <span dir="ltr">{x.email}</span> : <OrgSeat orgId={o.id} grantId={x.id} />}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      ))}
    </div>
  )
}
