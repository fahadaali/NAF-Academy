import { currentLearner } from '@/server/learner-auth'
import { ProfileForm } from '@/site/learn/ProfileForm'

export default async function Profile() {
  const me = (await currentLearner())!
  return <ProfileForm email={me.email} initial={{ name: me.name, phone: me.phone, org: me.org, vatNumber: me.vatNumber }} />
}
