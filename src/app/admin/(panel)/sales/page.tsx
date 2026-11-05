import Link from 'next/link'
import { salesOverview } from '@/admin/sales/data'
import { Badge, PageHead } from '@/admin/ui/kit'
import { ORDER_LABEL, ORDER_TONE, sar } from '@/admin/sales/labels'
import { gatewayStatus } from '@/server/payments/gateway'
import { paymentSettings } from '@/server/settings'
import s from '@/admin/sales/sales.module.css'
import p from '@/admin/ui/panel.module.css'

export default async function Sales() {
  const [o, settings] = await Promise.all([salesOverview(), paymentSettings()])
  const st = gatewayStatus()
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10)
    return { d, v: Number(o.daily.find((x) => x.day === d)?.net ?? 0) }
  })
  const max = Math.max(1, ...days.map((x) => x.v))
  return (
    <>
      <PageHead title="المبيعات" sub={settings.enabled && st.configured ? 'الدفع الإلكتروني مفعّل' : 'الدفع الإلكتروني مقفل — الطلبات اليدوية والمنح تعمل'}
        actions={<><Link className="btn ghost" href="/admin/settings/payments">إعدادات الدفع</Link><Link className="btn" href="/admin/orders/new">+ طلب يدوي</Link></>} />
      <div className={s.kpis}>
        <div className={s.kpi}><strong className="num" data-count>{sar(o.net30)}</strong><span>صافي الإيراد — 30 يوماً (ر.س)</span></div>
        <div className={s.kpi}><strong className="num" data-count>{o.orders30}</strong><span>طلب مدفوع — 30 يوماً</span></div>
        <div className={s.kpi}><strong className="num" data-count>{sar(o.net)}</strong><span>صافي الإيراد الكلي (ر.س)</span></div>
        <div className={s.kpi}><strong className="num" data-count>{o.enrolled}</strong><span>تسجيل نشط</span></div>
        <div className={s.kpi}><strong className="num" data-count>{o.pending}</strong><span>طلب معلّق الآن</span></div>
        <div className={s.kpi}><strong className="num" data-count>{o.interested}</strong><span>مهتم وقائمة انتظار</span></div>
      </div>
      <div className={s.chart} role="img" aria-label="الإيراد اليومي آخر 30 يوماً">
        {days.map((x, i) => <div key={x.d} title={`${x.d}: ${sar(x.v)} ر.س`} style={{ blockSize: `${(x.v / max) * 100}%`, ['--i' as string]: i }} />)}
      </div>
      <div className={s.two}>
        <section className={s.panel}>
          <h2>أعلى الدورات إيراداً</h2>
          {o.topCourses.length === 0 && <p className={p.muted}>لا مبيعات بعد.</p>}
          {o.topCourses.map((c) => <div key={c.title} className={s.row}><span>{c.title.replace(/~\d?/g, '')}</span><span className="num">{sar(Number(c.revenue))} · {c.seats} مقعد</span></div>)}
        </section>
        <section className={s.panel}>
          <h2>أعلى الكوبونات استخداماً</h2>
          {o.topCoupons.length === 0 && <p className={p.muted}>لا استخدام بعد.</p>}
          {o.topCoupons.map((c) => <div key={c.code} className={s.row}><span dir="ltr">{c.code}</span><span className="num">{c.uses} · خصم {sar(Number(c.discount))}</span></div>)}
        </section>
        <section className={s.panel}>
          <h2>أحدث الطلبات</h2>
          {o.recent.map((r) => (
            <Link key={r.id} href={`/admin/orders/${r.id}`} className={s.row}>
              <span><strong className="num">{r.number}</strong> <span className={p.muted}>{r.buyer.name}</span></span>
              <span><Badge tone={ORDER_TONE[r.status]}>{ORDER_LABEL[r.status]}</Badge></span>
            </Link>
          ))}
          <Link href="/admin/orders" className={p.muted}>كل الطلبات ←</Link>
        </section>
      </div>
    </>
  )
}
