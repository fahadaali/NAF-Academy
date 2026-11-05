import { currentLearner } from '@/server/learner-auth'
import { isOptedOut } from '@/server/notify/optout'
import { ProfileForm } from '@/site/learn/ProfileForm'
import { MailPrefs } from '@/site/learn/MailPrefs'
import { PushToggle } from '@/site/learn/PushToggle'
import { channelOpen, vapidKeys } from '@/server/notify/channels'
import { notifySettings } from '@/server/notify/engine'
import { beforeLabel } from '@/lib/notify'

export default async function Profile() {
  const me = (await currentLearner())!
  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <ProfileForm email={me.email} initial={{ name: me.name, phone: me.phone, org: me.org, vatNumber: me.vatNumber }} />
      {me.email && <MailPrefs optedOut={await isOptedOut(me.email)} />}
      {(await channelOpen('push')) && vapidKeys() && (
        /* تذكيرات المتصفح تتبع المواعيد العاجلة (المفعّلة للجوال) في «الرسائل الآلية» */
        <PushToggle publicKey={vapidKeys()!.publicKey} before={(await notifySettings()).sessionOffsets.filter((o) => o.sms).sort((a, b) => b.minutes - a.minutes).map((o) => beforeLabel(o.minutes)).join(' و')} />
      )}
    </div>
  )
}
