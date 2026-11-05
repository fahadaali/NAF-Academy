import { count, desc, isNull } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { requirePermission } from '@/server/auth'
import { PageHead } from '@/admin/ui/kit'
import p from '@/admin/ui/panel.module.css'

export default async function Organizations() {
  await requirePermission('corporate.manage')
  const [rows, members] = await Promise.all([
    db.select().from(s.organizations).where(isNull(s.organizations.deletedAt)).orderBy(desc(s.organizations.createdAt)),
    db.select({ orgId: s.orgMembers.orgId, n: count() }).from(s.orgMembers).groupBy(s.orgMembers.orgId),
  ])
  const m = new Map(members.map((x) => [x.orgId, x.n]))
  return (
    <>
      <PageHead title="حسابات المؤسسات" sub="مسؤول المؤسسة يتابع موظفيه ويخصّص مقاعدها من «حسابي»" actions={<><a className="btn ghost" href="/admin/corporate">الطلبات</a><a className="btn" href="/admin/organizations/new">+ مؤسسة</a></>} />
      {rows.length === 0 ? <div className={p.empty}>لا مؤسسات بعد — أنشئها من طلب أو يدوياً.</div> : (
        <table className={p.table}>
          <thead><tr><th>المؤسسة</th><th>النطاقات</th><th>الأعضاء المضافون</th></tr></thead>
          <tbody>{rows.map((o) => (
            <tr key={o.id}>
              <td><a href={`/admin/organizations/${o.id}`}><strong>{o.name}</strong></a></td>
              <td dir="ltr" style={{ textAlign: 'end' }}>{o.domains.join(', ') || '—'}</td>
              <td className="num">{m.get(o.id) ?? 0}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </>
  )
}
