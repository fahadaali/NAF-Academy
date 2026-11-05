import { notFound } from 'next/navigation'
import { sessionRoster } from '@/admin/learning/data'
import { AttendToggle } from '@/admin/learning/Review'
import { PageHead } from '@/admin/ui/kit'
import { when } from '@/admin/sales/labels'
import p from '@/admin/ui/panel.module.css'

const HOW: Record<string, string> = { qr: 'مسح QR', manual: 'يدوي', join: 'دخول الرابط' }

export default async function Roster({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cohort?: string }> }) {
  const r = await sessionRoster((await params).id, (await searchParams).cohort)
  if (!r) notFound()
  const present = r.people.filter((x) => x.at).length
  return (
    <>
      <PageHead title={r.lesson.title} sub={`${r.course}${r.cohort ? ` · ${r.cohort.title}` : ''} · ${r.lesson.startsAt ? when(r.lesson.startsAt) : 'بلا موعد'} · حضر ${present} من ${r.people.length}`}
        actions={<><a className="btn ghost" href="/admin/learning/sessions">كل الجلسات</a>{r.lesson.type === 'onsite' && <a className="btn" href="/admin/checkin">مسح التذاكر</a>}</>} />
      {r.people.length === 0 ? <div className={p.empty}>لا مسجّلين في الدورة.</div> : (
        <div className={p.scroll}><table className={p.table}>
          <thead><tr><th>المتدرب</th><th>التواصل</th><th>الحضور</th><th>التفاصيل</th></tr></thead>
          <tbody>{r.people.map((x) => (
            <tr key={x.learner.id}>
              <td><strong>{x.learner.name || '—'}</strong>{x.learner.org && <div className={p.muted}>{x.learner.org}</div>}</td>
              <td className={p.ltr}>{x.learner.email}<div className={p.muted}>{x.learner.phone}</div></td>
              <td><AttendToggle learnerId={x.learner.id} lessonId={r.lesson.id} present={!!x.at} /></td>
              <td className={`${p.muted} num`}>{x.at ? `${HOW[x.method ?? ''] ?? ''} · ${when(x.at)}${x.by ? ` · ${x.by}` : ''}` : ''}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  )
}
