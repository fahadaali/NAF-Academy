import { requirePermission } from '@/server/auth'
import { wafeqSettings, wafeqState } from '@/server/wafeq/client'
import { wafeqQueue } from '@/admin/sales/data'
import { WafeqSettingsForm } from '@/admin/sales/WafeqSettingsForm'

export const dynamic = 'force-dynamic'

export default async function Page() {
  await requirePermission('payments.manage')
  const [cfg, q] = await Promise.all([wafeqSettings(), wafeqQueue()])
  return <WafeqSettingsForm initial={cfg} state={wafeqState(cfg)} queue={q.counts} failed={q.failed} />
}
