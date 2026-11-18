import { redirect } from 'next/navigation'
import { currentLearner } from '@/server/learner-auth'
import { PageHero } from '@/site/PageHero'
import { LearnNav } from '@/site/learn/LearnNav'
import { managedOrgs } from '@/server/orgs'
import { InstallApp } from '@/site/learn/InstallApp'
import { brandView } from '@/server/brand'
import { inboxOf } from '@/server/achievements'

export const dynamic = 'force-dynamic'

export default async function LearnLayout({ children }: { children: React.ReactNode }) {
  const me = await currentLearner()
  if (!me) redirect('/login?next=/learn')
  const [orgs, inbox, brand] = await Promise.all([managedOrgs(me.id), inboxOf(me.id, 1), brandView()])
  return (
    <>
      <PageHero eyebrow="مساحتك" title={`أهلاً، ${me.name.split(' ')[0]}.`}>
        <LearnNav org={orgs.length > 0} unread={inbox.unread} />
      </PageHero>
      <div className="wrap" style={{ paddingBlock: '40px 110px' }}><InstallApp icon={brand.icon?.url} />{children}</div>
    </>
  )
}
