import { and, count, desc, eq, gte, isNotNull, sql } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { requirePermission } from '@/server/auth'
import { envVar } from '@/server/runtime'
import { Badge, PageHead } from '@/admin/ui/kit'
import { when } from '@/admin/sales/labels'
import { EVENT_META, type EventKey } from '@/lib/notify'
import p from '@/admin/ui/panel.module.css'

const TONE: Record<string, string> = { sent: 'open', outbox: 'soon', failed: 'full', bounced: 'full', suppressed: 'draft' }
const LABEL: Record<string, string> = { sent: 'أُرسلت', outbox: 'صندوق تجريبي', failed: 'فشلت', bounced: 'ارتدّت', suppressed: 'مكتوم' }
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—')

export default async function Messages() {
  await requirePermission('messages.read')
  const since = new Date(Date.now() - 30 * 864e5).toISOString()
  const [rows, stats, [sup]] = await Promise.all([
    db.select().from(s.messageLog).orderBy(desc(s.messageLog.createdAt)).limit(200),
    /* نسب آخر 30 يوماً لكل نوع رسالة بريدية مُرسلة فعلاً */
    db.select({
      kind: s.messageLog.kind, n: count(),
      delivered: sql<number>`sum(${s.messageLog.deliveredAt} is not null)`, opened: sql<number>`sum(${s.messageLog.openedAt} is not null)`,
      clicked: sql<number>`sum(${s.messageLog.clickedAt} is not null)`, bounced: sql<number>`sum(${s.messageLog.bouncedAt} is not null)`,
    }).from(s.messageLog).where(and(eq(s.messageLog.channel, 'email'), gte(s.messageLog.createdAt, since), isNotNull(s.messageLog.providerId))).groupBy(s.messageLog.kind),
    db.select({ n: count() }).from(s.mailSuppressions),
  ])
  const tracking = !!envVar('RESEND_WEBHOOK_SECRET')
  return (
    <>
      <PageHead title="سجل الرسائل" sub={tracking ? 'كل بريد ورسالة نصية خرجت، مع التسليم والفتح والارتداد — رموز الدخول مخفية في الإنتاج' : 'تتبّع الفتح والارتداد مقفل حتى يُضاف RESEND_WEBHOOK_SECRET ويُضبط رابط الأحداث في Resend'} />
      {tracking && stats.length > 0 && (
        <section style={{ marginBlockEnd: 22 }}>
          <h2 style={{ fontSize: 18, marginBlockEnd: 10 }}>آخر 30 يوماً <span className={p.muted}>· {sup.n} عنوان مكتوم (ارتداد دائم أو شكوى)</span></h2>
          <table className={p.table}>
            <thead><tr><th>الرسالة</th><th>المرسَل</th><th>التسليم</th><th>الفتح</th><th>النقر</th><th>الارتداد</th></tr></thead>
            <tbody className="num">{stats.map((x) => (
              <tr key={x.kind}>
                <td>{EVENT_META[x.kind as EventKey]?.label ?? x.kind}</td><td>{x.n}</td>
                <td>{pct(Number(x.delivered), x.n)}</td><td>{pct(Number(x.opened), x.n)}</td><td>{pct(Number(x.clicked), x.n)}</td><td>{pct(Number(x.bounced), x.n)}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}
      {rows.length === 0 ? <div className={p.empty}>لا رسائل بعد.</div> : (
        <table className={p.table}>
          <thead><tr><th>الوقت</th><th>إلى</th><th>الرسالة</th><th>الحالة</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td className={`${p.muted} num`}>{when(r.createdAt)}<div>{r.channel === 'email' ? 'بريد' : 'جوال'} · {r.kind}</div></td>
              <td dir="ltr" style={{ textAlign: 'end' }}>{r.to}</td>
              <td><strong>{r.subject}</strong><div className={p.muted} style={{ whiteSpace: 'pre-line' }}>{r.body}</div>{r.error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{r.error}</div>}</td>
              <td>
                <Badge tone={TONE[r.status] ?? 'draft'}>{LABEL[r.status] ?? r.status}</Badge>
                <div className={`${p.muted} num`} style={{ fontSize: 12, marginBlockStart: 4 }}>
                  {r.deliveredAt && <div>تسلّم {when(r.deliveredAt)}</div>}
                  {r.openedAt && <div>فُتح{r.opens > 1 ? ` ${r.opens} مرات` : ''}</div>}
                  {r.clickedAt && <div>نُقر رابط</div>}
                  {r.complainedAt && <div style={{ color: 'var(--danger)' }}>شكوى</div>}
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </>
  )
}
