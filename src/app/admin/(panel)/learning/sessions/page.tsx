import { missingRecordings, sessionsList } from '@/admin/learning/data'
import { ZoomCard } from '@/admin/learning/ZoomCard'
import { zoomEnabled, zoomState } from '@/server/zoom'
import { siteUrl } from '@/server/site'
import { Badge, PageHead } from '@/admin/ui/kit'
import { when } from '@/admin/sales/labels'
import p from '@/admin/ui/panel.module.css'

export default async function Sessions() {
  const [rows, missing, enabled] = await Promise.all([sessionsList(), missingRecordings(), zoomEnabled()])
  const zs = zoomState()
  const now = new Date().toISOString()
  return (
    <>
      <PageHead title="الجلسات والحضور" sub="الجلسات المباشرة والحضورية من كل الدورات" actions={<a className="btn" href="/admin/checkin">مسح تذاكر الحضور</a>} />
      <ZoomCard configured={zs.configured} enabled={enabled} problem={zs.configured ? undefined : zs.problem} hook={`${siteUrl() ?? ''}/api/zoom/webhook`} />
      {missing.length > 0 && (
        <section className={p.block}>
          <h2 className={p.h2}>جلسات انتهت بلا تسجيل <span className="num">({missing.length})</span></h2>
          <div className={p.scroll}><table className={p.table}>
            <tbody>{missing.map((m) => (
              <tr key={m.key}>
                <td><strong>{m.title}</strong><div className={p.muted}>{m.course}{m.cohort ? ` · ${m.cohort}` : ''}</div></td>
                <td className="num">{when(m.startsAt)}</td>
                {/* تسجيل الدفعة في جدول جلساتها، وتسجيل الدرس نفسه في المنهج */}
                <td><a className={p.rowLink} href={`/admin/courses/${m.courseId}?tab=${m.cohortId ? 'cohorts' : 'curriculum'}`}>أضف التسجيل ←</a></td>
              </tr>
            ))}</tbody>
          </table></div>
        </section>
      )}
      {rows.length === 0 ? <div className={p.empty}>لا جلسات مجدولة.</div> : (
        <div className={p.scroll}><table className={p.table}>
          <thead><tr><th>الجلسة</th><th>الموعد</th><th>النوع</th><th>الحضور</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.key}>
              <td><a href={`/admin/learning/sessions/${r.id}${r.cohortLabel ? `?cohort=${r.cohort ?? 'none'}` : ''}`}><strong>{r.title}</strong></a><div className={p.muted}>{r.course}{r.cohortLabel ? ` · ${r.cohortLabel}` : ''}</div></td>
              <td className="num">{r.startsAt ? when(r.startsAt) : '—'}{r.startsAt && r.startsAt < now && <div className={p.muted}>انتهت</div>}</td>
              <td><Badge tone={r.type === 'live' ? 'scheduled' : 'soon'}>{r.type === 'live' ? 'مباشرة' : 'حضورية'}</Badge></td>
              <td className="num">{r.attended} / {r.enrolled}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  )
}
