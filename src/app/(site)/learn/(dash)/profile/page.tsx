import { currentLearner } from '@/server/learner-auth'
import { isOptedOut } from '@/server/notify/optout'
import { ProfileForm } from '@/site/learn/ProfileForm'
import { MailPrefs } from '@/site/learn/MailPrefs'

export default async function Profile() {
  const me = (await currentLearner())!
  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <ProfileForm email={me.email} initial={{ name: me.name, phone: me.phone, org: me.org, vatNumber: me.vatNumber }} />
      {me.email && <MailPrefs optedOut={await isOptedOut(me.email)} />}
    </div>
  )
}
