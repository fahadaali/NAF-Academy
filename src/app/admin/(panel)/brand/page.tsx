import { desc, isNull } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { requirePermission } from '@/server/auth'
import { brandSettings } from '@/server/brand'
import { BrandEditor } from '@/admin/brand/BrandEditor'
import { PageHead } from '@/admin/ui/kit'

export default async function BrandPage() {
  await requirePermission('site.write')
  const [cfg, media] = await Promise.all([brandSettings(), db.select().from(s.media).where(isNull(s.media.deletedAt)).orderBy(desc(s.media.createdAt))])
  return (
    <>
      <PageHead title="الهوية والشعارات" sub="ما يُرفع هنا يحلّ مباشرة في كل صفحات المنصة والبريد والشهادات وصور المشاركة — بلا أي تعديل في الشيفرة" />
      <BrandEditor initial={cfg} media={media} />
    </>
  )
}
