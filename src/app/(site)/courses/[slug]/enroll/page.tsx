import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { courseDetail } from '@/server/queries'
import { priceFor, salesOpen, seatsUsed } from '@/server/sales'
import { paymentSettings } from '@/server/settings'
import { plain } from '@/motion/kashida'
import { PageHero } from '@/site/PageHero'
import { Checkout } from '@/site/checkout/Checkout'
import { InterestForm } from '@/site/checkout/InterestForm'
import { currentLearner } from '@/server/learner-auth'
import { channelOpen } from '@/server/notify/channels'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'التسجيل', robots: { index: false } }

export default async function Enroll({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ coupon?: string; tier?: string }> }) {
  const { slug } = await params
  const sp = await searchParams
  const d = await courseDetail(slug)
  if (!d) notFound()
  const title = plain(d.course.title)
  const st = d.course.status

  if (st !== 'open') {
    const kind = st === 'soon' ? 'notify_open' : st === 'full' ? 'waitlist' : 'next_cohort'
    return (
      <>
        <PageHero eyebrow={title} title={st === 'soon' ? 'قريباً جداً.' : st === 'full' ? 'اكتمل العدد.' : 'انتهى تسجيل هذه الدفعة.'} />
        <div className="wrap" style={{ paddingBlock: '44px 100px' }}><InterestForm slug={slug} kind={kind} /></div>
      </>
    )
  }

  const [priced, open, settings, me, emailOpen, smsOpen] = await Promise.all([priceFor(slug, { tierId: sp.tier, quantity: 1, code: sp.coupon }), salesOpen(), paymentSettings(), currentLearner(), channelOpen('email'), channelOpen('sms')])
  const channels = [...(emailOpen ? ['email' as const] : []), ...(smsOpen ? ['sms' as const] : [])]
  const learner = me ? { name: me.name, email: me.email, phone: me.phone, org: me.org, vatNumber: me.vatNumber } : null
  if (!priced) notFound()
  const left = d.row.seatsTotal !== null ? Math.max(0, d.row.seatsTotal - (await seatsUsed(d.row))) : 50
  const initial = { ...priced.q, couponCode: priced.q.couponApplied ? priced.coupon!.code : undefined, couponLabel: priced.coupon?.label, tierId: priced.tier?.id ?? null }
  const paidAndLocked = !open && priced.q.total > 0

  return (
    <>
      <PageHero eyebrow="التسجيل" title={d.course.title} body={d.course.subtitle} />
      <div className="wrap">
        {left === 0 ? (
          <div style={{ paddingBlock: '44px 100px' }}><InterestForm slug={slug} kind="waitlist" /></div>
        ) : (
          <>
            <Checkout
              slug={slug} title={title} tiers={d.tiers} groupRules={d.groupRules} maxQty={Math.min(50, left)}
              initial={initial} initialCode={sp.coupon ?? ''} salesOpen={open} terms={settings.terms} refundPolicy={settings.refundPolicy}
              learner={learner} channels={channels}
            />
            {paidAndLocked && <div style={{ paddingBlockEnd: 100, marginBlockStart: -60 }}><InterestForm slug={slug} kind="register" /></div>}
          </>
        )}
      </div>
    </>
  )
}
