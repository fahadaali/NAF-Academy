import { and, count, desc, eq } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { requirePermission } from '@/server/auth'
import { EVENT_META, type EventKey } from '@/lib/notify'
import { RowAction, RunNow } from '@/admin/notify/Queue'
import { Badge, PageHead } from '@/admin/ui/kit'
import { when } from '@/admin/sales/labels'
import p from '@/admin/ui/panel.module.css'

const F = [['pending', 'مجدولة'], ['sent', 'أُرسلت'], ['skipped', 'تُخطّيت'], ['cancelled', 'أُلغيت'], ['failed', 'فشلت']] as const
const TONE: Record<string, string> = { pending: 'scheduled', sending: 'soon', sent: 'open', skipped: 'draft', cancelled: 'closed', failed: 'full' }

export default async function Queue({ searchParams }: { searchParams: Promise<{ s?: string; e?: string }> }) {
  await requirePermission('notify.manage')
  const q = await searchParams
  const status = (F.find(([k]) => k === q.s)?.[0] ?? 'pending') as (typeof F)[number][0]
  const ev = q.e && q.e in EVENT_META ? q.e : undefined
  const [rows, counts] = await Promise.all([
    db.select({ n: s.notifications, course: s.courses.title }).from(s.notifications).leftJoin(s.courses, eq(s.courses.id, s.notifications.courseId))
      .where(and(eq(s.notifications.status, status), ev ? eq(s.notifications.event, ev) : undefined)).orderBy(status === 'pending' ? s.notifications.sendAt : desc(s.notifications.updatedAt)).limit(300),
    db.select({ st: s.notifications.status, n: count() }).from(s.notifications).groupBy(s.notifications.status),
  ])
  const c = new Map(counts.map((x) => [x.st, x.n]))
  return (
    <>
      <PageHead title="طابور الرسائل" sub="ما جُدول وما أُرسل ولماذا تُخطّيت رسالة" actions={<><a className="btn ghost" href="/admin/notifications">القوالب</a><RunNow /></>} />
      <div className={p.toolbar}><div className={p.chips}>{F.map(([k, l]) => <a key={k} href={`?s=${k}`} className={p.chip} aria-current={(status === k) ? 'page' : undefined}>{l} <span className="num">{c.get(k) ?? 0}</span></a>)}</div></div>
      {rows.length === 0 ? <div className={p.empty}>لا رسائل هنا.</div> : (
        <div className={p.scroll}><table className={p.table}>
          <thead><tr><th>الموعد</th><th>الرسالة</th><th>إلى</th><th>الحالة</th><th /></tr></thead>
          <tbody>{rows.map(({ n, course }) => (
            <tr key={n.id}>
              <td className={`${p.muted} num`}>{when(n.status === 'sent' ? n.sentAt : n.sendAt)}</td>
              <td><strong>{EVENT_META[n.event as EventKey]?.label ?? n.event}</strong><div className={p.muted}>{course}{n.ref.minutes ? ` · قبل ${Number(n.ref.minutes) >= 1440 ? `${Number(n.ref.minutes) / 1440} يوم` : `${n.ref.minutes} د`}` : ''}</div></td>
              <td className={p.ltr}>{n.to}<div className={p.muted}>{n.channel === 'email' ? 'بريد' : n.channel === 'sms' ? 'جوال' : 'متصفح'}</div></td>
              <td><Badge tone={TONE[n.status] ?? 'draft'}>{F.find(([k]) => k === n.status)?.[1] ?? n.status}</Badge>{n.error && <div className={`${p.muted} ${p.clampSm}`}>{n.error}</div>}{n.attempts > 1 && <div className={`${p.muted} num`}>محاولات: {n.attempts}</div>}</td>
              <td><RowAction id={n.id} status={n.status} /></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  )
}
