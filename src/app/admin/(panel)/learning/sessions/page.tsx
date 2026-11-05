import { sessionsList } from '@/admin/learning/data'
import { Badge, PageHead } from '@/admin/ui/kit'
import { when } from '@/admin/sales/labels'
import p from '@/admin/ui/panel.module.css'

export default async function Sessions() {
  const rows = await sessionsList()
  const now = new Date().toISOString()
  return (
    <>
      <PageHead title="الجلسات والحضور" sub="الجلسات المباشرة والحضورية من كل الدورات" actions={<a className="btn" href="/admin/checkin">مسح تذاكر الحضور</a>} />
      {rows.length === 0 ? <div className={p.empty}>لا جلسات مجدولة.</div> : (
        <table className={p.table}>
          <thead><tr><th>الجلسة</th><th>الموعد</th><th>النوع</th><th>الحضور</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td><a href={`/admin/learning/sessions/${r.id}`}><strong>{r.title}</strong></a><div className={p.muted}>{r.course}</div></td>
              <td className="num">{r.startsAt ? when(r.startsAt) : '—'}{r.startsAt && r.startsAt < now && <div className={p.muted}>انتهت</div>}</td>
              <td><Badge tone={r.type === 'live' ? 'scheduled' : 'soon'}>{r.type === 'live' ? 'مباشرة' : 'حضورية'}</Badge></td>
              <td className="num">{r.attended} / {r.enrolled}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </>
  )
}
