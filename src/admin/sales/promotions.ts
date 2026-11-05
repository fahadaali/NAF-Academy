'use server'
/* العروض العامة — خصم تلقائي على المنصة أو مسار أو دورات في نافذة زمنية. الحذف ناعم عبر السلة. */
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema as s } from '@/server/db'
import { requirePermission } from '@/server/auth'
import { audit } from '@/server/audit'
import { errorsOf, promotionInput, type Errors, type PromotionInput } from '@/admin/schemas'

type Result = { ok: true; id: string } | { ok: false; errors: Errors; message?: string }

export async function savePromotion(id: string | null, raw: PromotionInput): Promise<Result> {
  const st = await requirePermission('sales.coupons')
  if (id && !z.string().uuid().safeParse(id).success) return { ok: false, errors: {}, message: 'طلب غير صالح' }
  const p = promotionInput.safeParse(raw)
  if (!p.success) return { ok: false, errors: errorsOf(p.error), message: 'راجع الحقول' }
  /* القوائم غير المستعملة للنطاق تُفرَّغ فلا تبقى بقايا مختار سابق */
  const v = { ...p.data, trackIds: p.data.scope === 'tracks' ? p.data.trackIds : [], courseIds: p.data.scope === 'courses' ? p.data.courseIds : [] }
  const pid = id ?? randomUUID()
  if (id) {
    const done = await db.update(s.promotions).set({ ...v, updatedAt: new Date().toISOString() }).where(and(eq(s.promotions.id, id), isNull(s.promotions.deletedAt))).returning({ id: s.promotions.id })
    if (!done.length) return { ok: false, errors: {}, message: 'العرض غير موجود أو في المحذوفات' }
  } else await db.insert(s.promotions).values({ ...v, id: pid })
  await audit(st.name, id ? 'update' : 'create', 'promotion', pid, v.label, v)
  revalidatePath('/', 'layout')
  return { ok: true, id: pid }
}

export async function promotionsList() {
  await requirePermission('sales.coupons')
  return db.select().from(s.promotions).where(isNull(s.promotions.deletedAt)).orderBy(desc(s.promotions.createdAt))
}
