import { requireAdmin } from '@/server/auth'
import { paymentSettings } from '@/server/settings'
import { gatewayStatus } from '@/server/payments/gateway'
import { PaymentSettingsForm } from '@/admin/sales/PaymentSettingsForm'

export default async function Page() {
  await requireAdmin()
  return <PaymentSettingsForm initial={await paymentSettings()} status={gatewayStatus()} />
}
