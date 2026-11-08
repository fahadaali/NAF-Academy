import { requirePermission } from '@/server/auth'
import { getSetting, paymentSettings } from '@/server/settings'
import { gatewayStatus } from '@/server/payments/gateway'
import { PaymentSettingsForm } from '@/admin/sales/PaymentSettingsForm'

/** رمز تحقق ميسر من رابط الإشعار — يحفظه /api/payments/webhook، وصالح 30 دقيقة في لوحة ميسر */
type Verify = { code: string; at: string; signed: boolean }

export default async function Page() {
  await requirePermission('payments.manage')
  const v = await getSetting<Verify | null>('moyasar_webhook_verify', null)
  const fresh = v && Date.now() - Date.parse(v.at) < 30 * 60e3 ? v : null
  return <PaymentSettingsForm initial={await paymentSettings()} status={gatewayStatus()} verification={fresh} />
}
