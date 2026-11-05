import { requirePermission } from '@/server/auth'
import { homeContent } from '@/server/queries'
import { HomeEditor } from '@/admin/home/HomeEditor'

export default async function HomePage() {
  await requirePermission('site.write')
  return <HomeEditor initial={await homeContent()} />
}
