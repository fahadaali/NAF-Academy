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
import { and, eq } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { hasAccess } from '@/lib/cohorts'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'التسجيل', robots: { index: false } }

export default async function Enroll({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ coupon?: string; tier?: string; cohort?: string }> }) {
  const { slug } = await params
  const sp = await searchParams
  const d = await courseDetail(slug)
  if (!d) notFound()
  const title = plain(d.course.title)
  const st = d.course.status
  /* المنتهي وصوله يجدّد دائماً — ولو أُغلق التسجيل أو امتلأ — ويبقى في دفعته (قرار المالك) */
  const me0 = await currentLearner()
  const [mine] = me0 ? await db.select().from(s.enrollments).where(and(eq(s.enrollments.learnerId, me0.id), eq(s.enrollments.courseId, d.row.id), eq(s.enrollments.status, 'active'))) : []
  const renew = mine && !hasAccess(mine) ? mine : null

  if (st !== 'open' && !renew) {
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
  /* بدفعات: المقاعد لكل دفعة (يقيّدها الاختيار)، وإلا سعة الدورة */
  /* المجدِّد: دفعته متاحة له ولو أُغلقت أو امتلأت (مقعده قائم)، ولا حدّ لمقعد واحد */
  const cohorts = (d.course.cohorts ?? []).map((k) => (renew && k.id === renew.cohortId ? { ...k, state: 'open' as const, seats: undefined } : k))
  const left = renew ? 50 : cohorts.length ? 50 : d.row.seatsTotal !== null ? Math.max(0, d.row.seatsTotal - (await seatsUsed(d.row))) : 50
  const initial = { ...priced.q, couponCode: priced.q.couponApplied ? priced.coupon!.code : undefined, couponLabel: priced.coupon?.label, tierId: priced.tier?.id ?? null }
  /* بلا قناة دخول لا شراء (لا حساب يُدخل به) — والمجدِّد داخل أصلاً */
  const paidAndLocked = (!open && priced.q.total > 0) || (!channels.length && !me)

  return (
    <>
      <PageHero eyebrow={renew ? 'تجديد الوصول' : 'التسجيل'} title={d.course.title} body={renew ? 'تقدّمك محفوظ — بعد التجديد تكمل من حيث توقفت.' : d.course.subtitle} />
      <div className="wrap">
        {left === 0 ? (
          <div style={{ paddingBlock: '44px 100px' }}><InterestForm slug={slug} kind="waitlist" /></div>
        ) : (
          <>
            <Checkout
              slug={slug} title={title} tiers={d.tiers} cohorts={cohorts} initialCohort={sp.cohort ?? renew?.cohortId ?? null} groupRules={d.groupRules} maxQty={Math.min(50, left)}
              initial={initial} initialCode={sp.coupon ?? ''} salesOpen={open} terms={settings.terms} refundPolicy={settings.refundPolicy}
              learner={learner} channels={channels} methods={settings.methods} accessDays={d.course.accessDays}
            />
            {paidAndLocked && <div style={{ paddingBlockEnd: 100, marginBlockStart: -60 }}><InterestForm slug={slug} kind="register" /></div>}
          </>
        )}
      </div>
    </>
  )
}
