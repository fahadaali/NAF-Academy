import { notFound } from 'next/navigation'
import { brandView } from '@/server/brand'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { requirePermission } from '@/server/auth'
import { TemplateEditor } from '@/admin/certificates/TemplateEditor'
import { DEFAULT_DESIGN, mergeDesign } from '@/lib/certificate'
import { PageHead } from '@/admin/ui/kit'

export default async function EditTemplate({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('certificates.templates')
  const { id } = await params
  const brand = await brandView()
  const media = await db.select().from(s.media).where(isNull(s.media.deletedAt)).orderBy(desc(s.media.createdAt))
  if (id === 'new') {
    return (
      <>
        <PageHead title="قالب جديد" actions={<a className="btn ghost" href="/admin/certificates/templates">القوالب</a>} />
        <TemplateEditor id={null} initial={{ name: '', isDefault: false, design: DEFAULT_DESIGN }} media={media} brand={brand} />
      </>
    )
  }
  const [t] = await db.select().from(s.certificateTemplates).where(and(eq(s.certificateTemplates.id, id), isNull(s.certificateTemplates.deletedAt)))
  if (!t) notFound()
  return (
    <>
      <PageHead title={t.name} sub="اسحب العناصر على المعاينة، ثم «معاينة PDF» للتأكد قبل الحفظ" actions={<a className="btn ghost" href="/admin/certificates/templates">القوالب</a>} />
      <TemplateEditor key={t.updatedAt} id={t.id} initial={{ name: t.name, isDefault: t.isDefault, design: mergeDesign(t.design) }} media={media} brand={brand} />
    </>
  )
}
