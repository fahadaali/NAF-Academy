import { desc, eq } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { currentLearner } from '@/server/learner-auth'
import { formatAmount } from '@/lib/pricing'
import { plain } from '@/motion/kashida'
import st from '@/site/learn/learn.module.css'
import { inList } from '@/server/db/limits'

const STATUS: Record<string, string> = { paid: 'مدفوع', pending: 'بانتظار الدفع', failed: 'فشل', canceled: 'ملغى', expired: 'منتهي', refunded: 'مسترد', partially_refunded: 'مسترد جزئياً' }

export default async function MyOrders() {
  const me = (await currentLearner())!
  const orders = await db.select().from(s.orders).where(eq(s.orders.learnerId, me.id)).orderBy(desc(s.orders.createdAt))
  if (!orders.length) return <div className={st.empty}><strong>لا طلبات بعد.</strong></div>
  const ids = orders.map((o) => o.id)
  const [items, invs] = await Promise.all([
    db.select().from(s.orderItems).where(inList(s.orderItems.orderId, ids)),
    db.select().from(s.invoices).where(inList(s.invoices.orderId, ids)),
  ])
  const now = new Date().toISOString()
  return (
    <table className={st.table}>
      <thead><tr><th>الطلب</th><th>الدورة</th><th>الإجمالي</th><th>الحالة</th><th>المستندات</th></tr></thead>
      <tbody>
        {orders.filter((o) => o.status !== 'canceled' || o.paidAt).map((o) => {
          const status = o.status === 'pending' && o.expiresAt && o.expiresAt < now ? 'expired' : o.status
          return (
            <tr key={o.id}>
              <td><a className="num" href={`/orders/${o.number}?t=${o.token}`}>{o.number}</a></td>
              <td>{items.filter((i) => i.orderId === o.id).map((i) => <div key={i.id}>{plain(i.title)}{i.quantity > 1 && <span className="num"> × {i.quantity}</span>}</div>)}</td>
              <td className="num">{o.total ? formatAmount(o.total) : 'مجاناً'}</td>
              <td>{STATUS[status]}</td>
              <td>{invs.filter((v) => v.orderId === o.id).map((v) => <div key={v.id}><a href={`/orders/${o.number}/invoice/${v.number}?t=${o.token}`}>{v.kind === 'invoice' ? 'فاتورة' : 'إشعار دائن'}</a></div>)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
