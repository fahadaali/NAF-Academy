import { redirect } from 'next/navigation'
import { currentLearner } from '@/server/learner-auth'
import { PageHero } from '@/site/PageHero'
import { LearnNav } from '@/site/learn/LearnNav'
import { managedOrgs } from '@/server/orgs'
import { InstallApp } from '@/site/learn/InstallApp'

export const dynamic = 'force-dynamic'

export default async function LearnLayout({ children }: { children: React.ReactNode }) {
  const me = await currentLearner()
  if (!me) redirect('/login?next=/learn')
  return (
    <>
      <PageHero eyebrow="مساحتك" title={`أهلاً، ${me.name.split(' ')[0]}.`}>
        <LearnNav org={(await managedOrgs(me.id)).length > 0} />
      </PageHero>
      <div className="wrap" style={{ paddingBlock: '40px 110px' }}><InstallApp />{children}</div>
    </>
  )
}
