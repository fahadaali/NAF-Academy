import { requirePermission } from '@/server/auth'
import { paymentSettings } from '@/server/settings'
import { gatewayStatus } from '@/server/payments/gateway'
import { PaymentSettingsForm } from '@/admin/sales/PaymentSettingsForm'

export default async function Page() {
  await requirePermission('payments.manage')
  return <PaymentSettingsForm initial={await paymentSettings()} status={gatewayStatus()} />
}
