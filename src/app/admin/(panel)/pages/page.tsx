import { requirePermission } from '@/server/auth'
import { pagesContent } from '@/server/queries'
import { PagesEditor } from '@/admin/pages/PagesEditor'

export default async function PagesPage() {
  await requirePermission('site.write')
  return <PagesEditor initial={await pagesContent()} />
}
