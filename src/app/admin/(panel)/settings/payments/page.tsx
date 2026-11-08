import { requirePermission } from '@/server/auth'
import { getSetting, paymentSettings } from '@/server/settings'
import { gatewayStatus } from '@/server/payments/gateway'
import { PaymentSettingsForm, type Verify, type WebhookHit } from '@/admin/sales/PaymentSettingsForm'

export const dynamic = 'force-dynamic'

export default async function Page() {
  await requirePermission('payments.manage')
  /* يحفظهما /api/payments/webhook: رمز تحقق ميسر (صالح 30 دقيقة في لوحتها)، وسجل مختصر لآخر ما وصل */
  const v = await getSetting<Verify | null>('moyasar_webhook_verify', null)
  const fresh = v && Date.now() - Date.parse(v.at) < 30 * 60e3 ? v : null
  const hits = await getSetting<WebhookHit[]>('moyasar_webhook_log', [])
  return <PaymentSettingsForm initial={await paymentSettings()} status={gatewayStatus()} verification={fresh} hits={Array.isArray(hits) ? hits : []} />
}
