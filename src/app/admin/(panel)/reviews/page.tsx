import { and, count, desc, eq } from 'drizzle-orm'
import { inList } from '@/server/db/limits'
import { db, schema as s } from '@/server/db'
import { courseScope, requirePermission } from '@/server/auth'
import { Moderate } from '@/admin/reviews/Moderate'
import { PageHead } from '@/admin/ui/kit'
import { when } from '@/admin/sales/labels'
import p from '@/admin/ui/panel.module.css'

const F = [['pending', 'بانتظار المراجعة'], ['approved', 'منشورة'], ['hidden', 'مخفية']] as const

export default async function Reviews({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  /* المدرب: تقييمات دوراته وحدها */
  const scope = await courseScope(await requirePermission('content.write'))
  const mine = scope === null ? undefined : inList(s.reviews.courseId, scope)
  const q = (await searchParams).s
  const status = (F.find(([k]) => k === q)?.[0] ?? 'pending') as (typeof F)[number][0]
  const [rows, counts] = await Promise.all([
    db.select({ r: s.reviews, course: s.courses.title, email: s.learners.email, name: s.learners.name }).from(s.reviews)
      .innerJoin(s.courses, eq(s.courses.id, s.reviews.courseId)).innerJoin(s.learners, eq(s.learners.id, s.reviews.learnerId))
      .where(and(eq(s.reviews.status, status), mine)).orderBy(desc(s.reviews.updatedAt)).limit(300),
    db.select({ st: s.reviews.status, n: count() }).from(s.reviews).where(mine).groupBy(s.reviews.status),
  ])
  const n = new Map(counts.map((x) => [x.st, x.n]))
  return (
    <>
      <PageHead title="التقييمات" sub="لا يظهر تقييم في صفحة الدورة قبل نشره" />
      <div className={p.toolbar}><div className={p.chips}>{F.map(([k, l]) => <a key={k} href={`?s=${k}`} className={p.chip} aria-current={(status === k) ? 'page' : undefined}>{l} <span className="num">{n.get(k) ?? 0}</span></a>)}</div></div>
      {rows.length === 0 ? <div className={p.empty}>لا تقييمات هنا.</div> : (
        <table className={p.table}>
          <thead><tr><th>التقييم</th><th>الدورة</th><th>التعليق</th><th>يظهر باسم</th><th /></tr></thead>
          <tbody>{rows.map(({ r, course, email, name }) => (
            <tr key={r.id}>
              <td className="num" aria-label={`${r.rating} من 5`}>{'★'.repeat(r.rating)}<span className={p.muted}>{'★'.repeat(5 - r.rating)}</span></td>
              <td>{course.replace(/~\d/g, '')}<div className={`${p.muted} num`}>{when(r.updatedAt)}</div></td>
              <td style={{ maxInlineSize: 420 }}>{r.comment || <span className={p.muted}>—</span>}</td>
              <td>{r.display}<div className={p.muted} dir="ltr" style={{ textAlign: 'end' }}>{name} · {email}</div></td>
              <td><Moderate id={r.id} status={r.status} /></td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </>
  )
}
