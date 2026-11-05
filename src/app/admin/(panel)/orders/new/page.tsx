import { asc, isNull } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { requirePermission } from '@/server/auth'
import { ManualOrderForm } from '@/admin/sales/ManualOrderForm'

export default async function NewOrder() {
  await requirePermission('sales.orders')
  const [courses, tiers] = await Promise.all([
    db.select().from(s.courses).where(isNull(s.courses.deletedAt)).orderBy(asc(s.courses.sortOrder)),
    db.select().from(s.priceTiers).orderBy(asc(s.priceTiers.sortOrder)),
  ])
  return <ManualOrderForm courses={courses.map((c) => ({ slug: c.slug, title: c.title, tiers: tiers.filter((t) => t.courseId === c.id).map((t) => ({ id: t.id, name: t.name })) }))} />
}
