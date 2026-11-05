import { desc } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { requirePermission } from '@/server/auth'
import { Badge, PageHead } from '@/admin/ui/kit'
import { when } from '@/admin/sales/labels'
import p from '@/admin/ui/panel.module.css'

const TONE: Record<string, string> = { sent: 'open', outbox: 'soon', failed: 'full' }
const LABEL: Record<string, string> = { sent: 'أُرسلت', outbox: 'صندوق تجريبي', failed: 'فشلت' }

export default async function Messages() {
  await requirePermission('messages.read')
  const rows = await db.select().from(s.messageLog).orderBy(desc(s.messageLog.createdAt)).limit(200)
  return (
    <>
      <PageHead title="سجل الرسائل" sub="كل بريد ورسالة نصية خرجت — رموز الدخول مخفية في الإنتاج" />
      {rows.length === 0 ? <div className={p.empty}>لا رسائل بعد.</div> : (
        <table className={p.table}>
          <thead><tr><th>الوقت</th><th>إلى</th><th>الرسالة</th><th>الحالة</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td className={`${p.muted} num`}>{when(r.createdAt)}<div>{r.channel === 'email' ? 'بريد' : 'جوال'} · {r.kind}</div></td>
              <td dir="ltr" style={{ textAlign: 'end' }}>{r.to}</td>
              <td><strong>{r.subject}</strong><div className={p.muted} style={{ whiteSpace: 'pre-line' }}>{r.body}</div>{r.error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{r.error}</div>}</td>
              <td><Badge tone={TONE[r.status] ?? 'draft'}>{LABEL[r.status] ?? r.status}</Badge></td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </>
  )
}
