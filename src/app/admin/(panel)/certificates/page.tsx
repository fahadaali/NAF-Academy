import { and, count, desc, eq, isNull } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { requirePermission } from '@/server/auth'
import { Board, Recheck, type BoardRow } from '@/admin/certificates/Board'
import { PageHead } from '@/admin/ui/kit'
import { when } from '@/admin/sales/labels'
import p from '@/admin/ui/panel.module.css'

const F = [['pending', 'بانتظار المراجعة'], ['issued', 'صادرة'], ['rejected', 'مرفوضة'], ['revoked', 'ملغاة']] as const

export default async function Certificates({ searchParams }: { searchParams: Promise<{ s?: string; c?: string }> }) {
  await requirePermission('certificates.manage')
  const q = await searchParams
  const status = (F.find(([k]) => k === q.s)?.[0] ?? 'pending') as (typeof F)[number][0]
  const [rows, counts, courses] = await Promise.all([
    db.select({ c: s.certificates, email: s.learners.email }).from(s.certificates).innerJoin(s.learners, eq(s.learners.id, s.certificates.learnerId))
      .where(and(eq(s.certificates.status, status), q.c ? eq(s.certificates.courseId, q.c) : undefined)).orderBy(desc(s.certificates.updatedAt)).limit(500),
    db.select({ st: s.certificates.status, n: count() }).from(s.certificates).groupBy(s.certificates.status),
    db.select({ id: s.courses.id, title: s.courses.title }).from(s.courses).where(isNull(s.courses.deletedAt)),
  ])
  const n = new Map(counts.map((x) => [x.st, x.n]))
  const board: BoardRow[] = rows.map(({ c, email }) => ({
    id: c.id, name: c.name, email, course: c.courseTitle, status: c.status, code: c.code, criteria: c.criteria, reason: c.reason, by: c.decidedBy,
    when: when(c.status === 'issued' ? c.issuedAt : c.status === 'revoked' ? c.revokedAt : c.createdAt),
  }))
  return (
    <>
      <PageHead title="الشهادات" sub="تُفحص الشروط تلقائياً بعد كل تقدّم — اعتمد ما بانتظار المراجعة" actions={<a className="btn ghost" href="/admin/certificates/templates">القوالب</a>} />
      <div className={p.toolbar}>
        <div className={p.chips}>{F.map(([k, l]) => <a key={k} href={`?s=${k}${q.c ? `&c=${q.c}` : ''}`} className={p.chip} aria-current={(status === k) ? 'page' : undefined}>{l} <span className="num">{n.get(k) ?? 0}</span></a>)}</div>
        <span style={{ flex: 1 }} />
        <Recheck courses={courses.map((c) => ({ id: c.id, title: c.title.replace(/~\d/g, '') }))} />
      </div>
      <Board rows={board} status={status} empty={status === 'pending' ? 'لا شهادات بانتظار المراجعة.' : 'لا شهادات هنا.'} />
    </>
  )
}
