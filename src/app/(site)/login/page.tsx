import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PageHero } from '@/site/PageHero'
import { LoginPanel } from '@/site/auth/LoginPanel'
import { channelOpen } from '@/server/notify/channels'
import { currentLearner, safeNext } from '@/server/learner-auth'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'الدخول', robots: { index: false } }

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next)
  if (await currentLearner()) redirect(next)
  const channels = [...((await channelOpen('email')) ? ['email' as const] : []), ...((await channelOpen('sms')) ? ['sms' as const] : [])]
  return (
    <>
      <PageHero eyebrow="حسابك" title="أهلاً بعودت~3ك." body="ادخل برمز يصلك على بريدك أو جوالك — بلا كلمة مرور." />
      <div className="wrap" style={{ paddingBlock: '44px 110px', display: 'grid', justifyItems: 'start' }}>
        <LoginPanel channels={channels} next={next} />
      </div>
    </>
  )
}
