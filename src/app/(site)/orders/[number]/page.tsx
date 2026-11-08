import { eq } from 'drizzle-orm'
import { payFailureAr } from '@/lib/pay-errors'
import { db, schema as sc } from '@/server/db'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { orderForBuyer } from '@/server/sales'
import { channelOpen } from '@/server/notify/channels'
import { formatAmount } from '@/lib/pricing'
import { formatDay, formatHijri, formatTime } from '@/lib/dates'
import { modeLabel } from '@/lib/course-meta'
import { plain } from '@/motion/kashida'
import { Words } from '@/components/Words'
import { Riyal } from '@/components/Riyal'
import s from '@/site/order.module.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'طلبك', robots: { index: false } }

const STATUS: Record<string, string> = {
  paid: 'مدفوع', pending: 'بانتظار الدفع', failed: 'فشل الدفع', expired: 'انتهت مهلة الحجز', canceled: 'ملغى',
  refunded: 'مسترد', partially_refunded: 'مسترد جزئياً',
}

export default async function OrderPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ t?: string; failed?: string }> }) {
  const { number } = await params
  const { t = '', failed } = await searchParams
  const [o, mailOpen] = await Promise.all([orderForBuyer(number, t), channelOpen('email')])
  if (!o) notFound()
  const { order, items, course, invoices } = o
  const paid = order.status === 'paid' || order.status === 'partially_refunded'
  const it = items[0]
  /* بدفعة: موعدها ومدينتها ومقرّها (لا موعد الدورة الأساسي) */
  const [k] = it?.cohortId ? await db.select().from(sc.cohorts).where(eq(sc.cohorts.id, it.cohortId)) : []
  const startsAt = k ? k.startsAt : course?.startsAt ?? null
  const city = k ? k.city || course?.city : course?.city
  const venue = k?.venue.split('\n')[0] ?? ''
  const q = `?t=${t}`

  return (
    <div className={s.page}>
      <header className={s.hero} data-surface="night" data-state={paid ? 'paid' : order.status}>
        {paid && <div className={s.burst} aria-hidden="true">{Array.from({ length: 24 }, (_, i) => <span key={i} style={{ ['--i' as string]: i }} />)}</div>}
        <div className={`wrap ${s.heroInner}`}>
          <span className="eyebrow" style={{ color: 'var(--gold-4)' }}>الطلب {order.number}</span>
          {paid ? <Words as="h1" text="تمّ تسجي~5لك." className={s.title} />
            : order.status === 'pending' ? <Words as="h1" text={failed ? 'لم تكتمل الدفعة.' : 'بانتظار الدفع.'} className={s.title} />
            : <Words as="h1" text={STATUS[order.status]} className={s.title} />}
          {paid && <p className={`reveal ${s.lead}`}>{order.method === 'grant' ? 'سُجّلت بمنحة كاملة.' : 'وصلنا مبلغك، ومقعدك مؤكّد.'}{mailOpen ? ` أرسلنا التفاصيل إلى ${order.buyer.email}.` : ''}</p>}
          {failed && order.status === 'pending' && <p className={s.lead}>{payFailureAr(failed)} يمكنك المحاولة مرة أخرى — مقعدك ما زال محجوزاً.</p>}
          {order.status === 'expired' && course && <p className={s.lead}>انتهت مهلة حجز المقعد. <a href={`/courses/${course.slug}/enroll`}>ابدأ التسجيل من جديد</a></p>}
          {order.status === 'pending' && <a className="btn" href={`/orders/${order.number}/pay${q}`}>{failed ? 'حاول مرة أخرى' : 'أكمل الدفع'}</a>}
        </div>
      </header>

      <div className={`wrap ${s.body}`}>
        <section className={s.card}>
          <h2>{plain(it?.title ?? '')}{it?.tierName && <small> · {it.tierName}</small>}</h2>
          {course && (
            <dl className={`num ${s.facts}`}>
              <div><dt>النمط</dt><dd>{modeLabel[course.mode]}</dd></div>
              {k && <div><dt>الدفعة</dt><dd>{k.title}</dd></div>}
              {startsAt && <div><dt>يبدأ</dt><dd>{formatDay(startsAt)} · {formatTime(startsAt)}<small>{formatHijri(startsAt)}</small></dd></div>}
              {(city || venue) && <div><dt>المكان</dt><dd>{city}{venue && <small>{venue}</small>}</dd></div>}
              {it && it.quantity > 1 && <div><dt>المقاعد</dt><dd>{it.quantity}{order.attendSelf ? <small>أحدها لك، والبقية تُخصَّص لفريقك</small> : <small>تُخصَّص لفريقك</small>}</dd></div>}
            </dl>
          )}
          <dl className={s.money}>
            <div><dt>المجموع</dt><dd className="num">{formatAmount(order.subtotal)} <Riyal /></dd></div>
            {order.groupDiscount > 0 && <div><dt>خصم المجموعة</dt><dd className="num"><bdi dir="ltr">−{formatAmount(order.groupDiscount)}</bdi></dd></div>}
            {order.couponDiscount > 0 && <div><dt>الكوبون {order.couponCode}</dt><dd className="num"><bdi dir="ltr">−{formatAmount(order.couponDiscount)}</bdi></dd></div>}
            <div className={s.grand}><dt>الإجمالي</dt><dd className="num">{order.total ? <>{formatAmount(order.total)} <Riyal /></> : 'مجاناً'}</dd></div>
            {order.refunded > 0 && <div><dt>المسترد</dt><dd className="num">{formatAmount(order.refunded)}</dd></div>}
          </dl>
          <div className={s.actions}>
            {invoices.map((inv) => (
              <a key={inv.id} className="btn ghost" href={`/orders/${order.number}/invoice/${inv.number}${q}`}>{inv.kind === 'invoice' ? 'الفاتورة الضريبية' : `إشعار دائن ${inv.number}`}</a>
            ))}
            {paid && course && startsAt && <a className="btn ghost" href={`/courses/${course.slug}/calendar${k ? `?cohort=${k.id}` : ''}`}>أضف إلى التقويم</a>}
            {course && <a className={s.link} href={`/courses/${course.slug}`}>صفحة الدورة ←</a>}
          </div>
        </section>
        {paid && (
          <section className={s.next}>
            <h2>الخطوات التالية</h2>
            <ol role="list">
              <li><span><strong>احفظ هذه الصفحة</strong> — رابطها هو إيصالك حتى تفعيل حسابك.</span></li>
              <li><span><strong>تصلك التذكيرات</strong> قبل الموعد بوقت كافٍ، مع رابط الانضمام أو تفاصيل المكان.</span></li>
              {it && it.quantity > 1 && <li><span><strong>أرسل لنا بريد كل مشارك</strong> لنخصّص له مقعده.</span></li>}
            </ol>
          </section>
        )}
      </div>
    </div>
  )
}
