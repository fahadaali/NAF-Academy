import { notFound } from 'next/navigation'
import { orderDetail } from '@/admin/sales/data'
import { Badge, PageHead } from '@/admin/ui/kit'
import { METHOD_LABEL, ORDER_LABEL, ORDER_TONE, sar, when } from '@/admin/sales/labels'
import { CancelPending, RefundPanel, ResendOrder, SeatRow } from '@/admin/sales/OrderTools'
import s from '@/admin/sales/sales.module.css'
import p from '@/admin/ui/panel.module.css'
import { staffCan } from '@/server/auth'

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const d = await orderDetail((await params).id)
  if (!d) notFound()
  const { order: o, items, pays, refunds, invoices, grants, enrolls, log } = d
  const expired = o.status === 'pending' && !!o.expiresAt && o.expiresAt < new Date().toISOString()
  const status = expired ? 'expired' : o.status
  const left = o.total - o.refunded
  const buyerUrl = `/orders/${o.number}?t=${o.token}`
  /* أدوات الطلب بصلاحيتها: الاسترداد للمالية، والإلغاء وتخصيص المقاعد لمن يدير الطلبات */
  const [canRefund, canOrders] = await Promise.all([staffCan('sales.refund'), staffCan('sales.orders')])
  return (
    <>
      <PageHead title={`الطلب ${o.number}`} sub={`${when(o.createdAt)} · ${METHOD_LABEL[o.method]}${o.createdBy !== 'web' ? ` · أنشأه ${o.createdBy}` : ''}`}
        actions={<><Badge tone={ORDER_TONE[status]}>{ORDER_LABEL[status]}</Badge><a className="btn ghost" href={buyerUrl} target="_blank" rel="noreferrer">صفحة المشتري ↗</a>{o.status === 'pending' && canOrders && <CancelPending orderId={o.id} />}{canOrders && o.total > 0 && ['paid', 'partially_refunded', 'refunded'].includes(o.status) && <ResendOrder orderId={o.id} />}</>} />
      <div className={s.two}>
        <section className={s.panel}>
          <h2>المشتري</h2>
          <div className={s.row}><span>الاسم</span><span>{o.buyer.name}</span></div>
          <div className={s.row}><span>البريد</span><span dir="ltr">{o.buyer.email}</span></div>
          <div className={s.row}><span>الجوال</span><span dir="ltr">{o.buyer.phone || '—'}</span></div>
          {o.buyer.org && <div className={s.row}><span>الجهة</span><span>{o.buyer.org}</span></div>}
          {o.buyer.vatNumber && <div className={s.row}><span>الرقم الضريبي</span><span className="num">{o.buyer.vatNumber}</span></div>}
          {o.note && <div className={s.row}><span>ملاحظة</span><span>{o.note}</span></div>}
        </section>
        <section className={s.panel}>
          <h2>المبالغ</h2>
          {items.map((i) => <div key={i.id} className={s.row}><span>{i.title.replace(/~\d?/g, '')}{i.tierName && ` — ${i.tierName}`} <span className="num">× {i.quantity}</span></span><span className="num">{sar(i.lineTotal)}</span></div>)}
          {o.groupDiscount > 0 && <div className={s.row}><span>خصم المجموعة</span><bdi dir="ltr" className="num">−{sar(o.groupDiscount)}</bdi></div>}
          {o.couponDiscount > 0 && <div className={s.row}><span>الكوبون <span dir="ltr">{o.couponCode}</span></span><bdi dir="ltr" className="num">−{sar(o.couponDiscount)}</bdi></div>}
          <div className={s.row}><strong>الإجمالي (شامل الضريبة)</strong><strong className="num">{sar(o.total)} ر.س</strong></div>
          <div className={s.row}><span>منها الضريبة</span><span className="num">{sar(o.vat)}</span></div>
          {o.refunded > 0 && <div className={s.row}><span>المسترد</span><span className="num">{sar(o.refunded)}</span></div>}
          {invoices.map((inv) => <a key={inv.id} className={p.muted} href={`/orders/${o.number}/invoice/${inv.number}?t=${o.token}`} target="_blank" rel="noreferrer">{inv.kind === 'invoice' ? 'الفاتورة' : 'إشعار دائن'} {inv.number} ↗</a>)}
        </section>
        {(o.status === 'paid' || o.status === 'partially_refunded') && left > 0 && canRefund && <RefundPanel orderId={o.id} left={left} />}
        {grants.length > 0 && (
          <section className={s.panel}>
            <h2>مقاعد الطلب الجماعي <span className="num">({grants.filter((g) => g.enrollmentId).length}/{grants.length})</span></h2>
            {grants.map((g, i) => (
              <div key={g.id} className={s.row}>
                <span className="num">المقعد {i + 1}</span>
                {g.enrollmentId ? <span dir="ltr">{g.email}</span> : canOrders ? <SeatRow grantId={g.id} /> : <span className={p.muted}>شاغر</span>}
              </div>
            ))}
          </section>
        )}
        <section className={s.panel}>
          <h2>التسجيلات</h2>
          {enrolls.length === 0 && <p className={p.muted}>لا تسجيلات بعد.</p>}
          {enrolls.map(({ e, l }) => <div key={e.id} className={s.row}><span>{l.name} <span className={p.muted} dir="ltr">{l.email}</span></span><Badge tone={e.status === 'active' ? 'open' : 'draft'}>{e.status === 'active' ? 'نشط' : 'ملغى'}</Badge></div>)}
        </section>
        <section className={s.panel}>
          <h2>الخط الزمني</h2>
          <ol className={s.timeline}>
            {log.map((x) => <li key={x.id}><span><strong>{x.summary}</strong><br /><span className={`${p.muted} num`}>{when(x.at)} · {x.actor}</span></span></li>)}
            {pays.map((x) => <li key={x.id}><span>دفعة {x.status} · {x.method} <span className="num">{sar(x.amount)}</span>{x.message && ` — ${x.message}`}<br /><span className={`${p.muted} num`}>{when(x.createdAt)} · {x.gateway} {x.gatewayId}</span></span></li>)}
            {refunds.map((x) => <li key={x.id}><span>استرداد <span className="num">{sar(x.amount)}</span> — {x.reason}<br /><span className={`${p.muted} num`}>{when(x.createdAt)} · {x.by}</span></span></li>)}
          </ol>
        </section>
      </div>
    </>
  )
}
