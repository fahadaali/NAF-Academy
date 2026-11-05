/* دليل المتدربين — بحث بالاسم والبريد والجوال والجهة، وتصفية بالدورة، وتصدير */
import Link from 'next/link'
import { learnersList, PAGE_SIZE } from '@/admin/learners/data'
import { ExportLearners } from '@/admin/learners/ExportLearners'
import { PageHead } from '@/admin/ui/kit'
import { when } from '@/admin/sales/labels'
import p from '@/admin/ui/panel.module.css'

export default async function Learners({ searchParams }: { searchParams: Promise<{ q?: string; c?: string; p?: string }> }) {
  const sp = await searchParams
  const { rows, total, page, courses } = await learnersList({ q: sp.q, course: sp.c, page: Number(sp.p) || 0 })
  const link = (pg: number) => `?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.c ? { c: sp.c } : {}), p: String(pg) })}`
  const pages = Math.ceil(total / PAGE_SIZE)
  return (
    <>
      <PageHead title="المتدربون" sub={`${total} متدرب${sp.q || sp.c ? ' يطابق البحث' : ''}`}
        actions={<ExportLearners rows={rows.map((r) => [r.l.name, r.l.email, r.l.phone, r.l.org, r.active, r.certs, r.lastEnrolled ?? '', r.l.createdAt])} />} />
      <form className={p.toolbar} role="search">
        <input className={p.search} type="search" name="q" defaultValue={sp.q ?? ''} placeholder="ابحث بالاسم أو البريد أو الجوال أو الجهة" aria-label="بحث" />
        <select className={p.search} name="c" defaultValue={sp.c ?? ''} aria-label="الدورة" style={{ minInlineSize: 200 }}>
          <option value="">كل الدورات</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <button className="btn" type="submit">بحث</button>
        {(sp.q || sp.c) && <Link className="btn ghost" href="/admin/learners">مسح</Link>}
      </form>
      {rows.length === 0 ? <div className={p.empty}>لا متدربين يطابقون البحث.</div> : (
        <div className={p.scroll}><table className={p.table}>
          <thead><tr><th>المتدرب</th><th>الجوال</th><th>الجهة</th><th>دورات نشطة</th><th>شهادات</th><th>آخر تسجيل</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.l.id}>
                <td><Link href={`/admin/learners/${r.l.id}`} className={p.rowLink}>{r.l.name}</Link><div className={`${p.muted} ${p.ltr}`}>{r.l.email}</div></td>
                <td className={`num ${p.ltr}`}>{r.l.phone || '—'}</td>
                <td className={p.muted}>{r.l.org || '—'}</td>
                <td className="num">{r.active}</td>
                <td className="num">{r.certs}</td>
                <td className={`${p.muted} num`}>{r.lastEnrolled ? when(r.lastEnrolled) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {pages > 1 && (
        <nav className={p.toolbar} aria-label="الصفحات" style={{ marginBlockStart: 16 }}>
          {page > 0 && <Link className="btn ghost" href={link(page - 1)}>السابق</Link>}
          <span className={`${p.muted} num`}>صفحة {page + 1} من {pages}</span>
          {page + 1 < pages && <Link className="btn ghost" href={link(page + 1)}>التالي</Link>}
        </nav>
      )}
    </>
  )
}
