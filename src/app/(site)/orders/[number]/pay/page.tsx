import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { orderForBuyer } from '@/server/sales'
import { gateway } from '@/server/payments/gateway'
import { paymentSettings } from '@/server/settings'
import { formatAmount } from '@/lib/pricing'
import { plain } from '@/motion/kashida'
import { PageHero } from '@/site/PageHero'
import { PayForm } from '@/site/checkout/PayForm'
import { Riyal } from '@/components/Riyal'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'الدفع', robots: { index: false } }

export default async function Pay({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ t?: string }> }) {
  const { number } = await params
  const { t = '' } = await searchParams
  const o = await orderForBuyer(number, t)
  if (!o) notFound()
  if (o.order.status !== 'pending') redirect(`/orders/${number}?t=${t}`)
  const [g, settings] = await Promise.all([gateway(), paymentSettings()])
  if (!g || !settings.enabled) redirect(`/orders/${number}?t=${t}`)
  const h = await headers()
  const origin = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`
  const title = plain(o.items[0]?.title ?? '')
  return (
    <>
      <PageHero eyebrow={`الطلب ${number}`} title="الدفع الآمن.">
        <p className="num" style={{ fontSize: 28, fontWeight: 800 }}>{formatAmount(o.order.total)} <Riyal /></p>
      </PageHero>
      <div className="wrap" style={{ paddingBlock: '44px 100px', maxInlineSize: 560 }}>
        <PayForm
          kind={g.kind} publishableKey={g.publishableKey} orderId={o.order.id} orderNumber={number} amount={o.order.total}
          description={`${title} — ${number}`} callbackUrl={`${origin}/api/payments/callback?order=${o.order.id}`}
          methods={settings.methods} merchant={settings.seller.name}
        />
        <p className="num" style={{ marginBlockStart: 18, fontSize: 13, color: 'var(--muted)' }}>
          مقعدك محجوز حتى {new Date(o.order.expiresAt!).toLocaleTimeString('ar-SA-u-nu-latn', { timeZone: 'Asia/Riyadh', hour: 'numeric', minute: '2-digit' })}
        </p>
      </div>
    </>
  )
}
