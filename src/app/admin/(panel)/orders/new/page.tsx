import { asc, isNull } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { requirePermission } from '@/server/auth'
import { ManualOrderForm } from '@/admin/sales/ManualOrderForm'
import { cohortState } from '@/lib/cohorts'

export default async function NewOrder() {
  await requirePermission('sales.orders')
  const [courses, tiers, cohorts] = await Promise.all([
    db.select().from(s.courses).where(isNull(s.courses.deletedAt)).orderBy(asc(s.courses.sortOrder)),
    db.select().from(s.priceTiers).orderBy(asc(s.priceTiers.sortOrder)),
    db.select().from(s.cohorts).where(isNull(s.cohorts.deletedAt)).orderBy(asc(s.cohorts.sortOrder)),
  ])
  /* الموظف يسجّل في أي دفعة غير منتهية (المغلقة يدوياً والمنتهية لا تُعرض) */
  const live = cohorts.filter((k) => cohortState({ ...k, taken: 0 }) !== 'closed')
  return <ManualOrderForm courses={courses.map((c) => ({
    slug: c.slug, title: c.title,
    tiers: tiers.filter((t) => t.courseId === c.id).map((t) => ({ id: t.id, name: t.name })),
    cohorts: cohorts.some((k) => k.courseId === c.id) ? live.filter((k) => k.courseId === c.id).map((k) => ({ id: k.id, title: k.title })) : null,
  }))} />
}
