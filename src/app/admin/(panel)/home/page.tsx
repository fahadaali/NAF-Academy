import { requireAdmin } from '@/server/auth'
import { homeContent } from '@/server/queries'
import { HomeEditor } from '@/admin/home/HomeEditor'

export default async function HomePage() {
  await requireAdmin()
  return <HomeEditor initial={await homeContent()} />
}
