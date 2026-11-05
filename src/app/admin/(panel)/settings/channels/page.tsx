import { requirePermission } from '@/server/auth'
import { channelSettings, channelState } from '@/server/notify/channels'
import { ChannelsForm } from '@/admin/team/ChannelsForm'

export default async function Channels() {
  await requirePermission('channels.manage')
  return <ChannelsForm initial={await channelSettings()} email={channelState('email')} sms={channelState('sms')} push={channelState('push')} />
}
