import { requirePermission, staffCan } from '@/server/auth'
import { notifySettings } from '@/server/notify/engine'
import { channelOpen } from '@/server/notify/channels'
import { siteUrl } from '@/server/site'
import { NotifyEditor } from '@/admin/notify/NotifyEditor'
import { PageHead } from '@/admin/ui/kit'

export default async function Notifications() {
  const st = await requirePermission('notify.manage')
  const [cfg, email, sms] = await Promise.all([notifySettings(), channelOpen('email'), channelOpen('sms')])
  const site = siteUrl()
  const state = [!site && 'SITE_URL غير مضبوط — الرسائل الآلية متوقفة', !email && 'البريد مقفل', !sms && 'الجوال مقفل'].filter(Boolean).join(' · ')
  return (
    <>
      <PageHead title="الرسائل الآلية" sub={state || 'القنوات مفتوحة — تُجدول الرسائل وتُرسل كل 5 دقائق'}
        actions={<><a className="btn ghost" href="/admin/notifications/queue">الطابور</a>{(await staffCan('channels.manage')) && <a className="btn ghost" href="/admin/settings/channels">القنوات</a>}</>} />
      <NotifyEditor initial={cfg} staffEmail={st.email ?? ''} />
    </>
  )
}
