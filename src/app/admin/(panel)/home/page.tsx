import { desc, isNull } from 'drizzle-orm'
import { requirePermission } from '@/server/auth'
import { homeContent } from '@/server/queries'
import { db, schema as s } from '@/server/db'
import { HomeEditor } from '@/admin/home/HomeEditor'

export default async function HomePage() {
  await requirePermission('site.write')
  const [initial, media] = await Promise.all([homeContent(), db.select().from(s.media).where(isNull(s.media.deletedAt)).orderBy(desc(s.media.createdAt))])
  return <HomeEditor initial={initial} media={media} />
}
