'use server'
/* الإشراف على التقييمات — النشر أو الإخفاء، ويُحدَّث صفحة الدورة فوراً */
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema as s } from '@/server/db'
import { courseScope, inScope, requirePermission } from '@/server/auth'
import { audit } from '@/server/audit'

export async function moderateReview(id: string, status: 'approved' | 'hidden') {
  const st = await requirePermission('content.write')
  if (!z.enum(['approved', 'hidden']).safeParse(status).success || !z.string().uuid().safeParse(id).success) return { ok: false }
  const [cur] = await db.select().from(s.reviews).where(eq(s.reviews.id, id))
  if (!cur || !inScope(await courseScope(st), cur.courseId)) return { ok: false }
  const [r] = await db.update(s.reviews).set({ status, updatedAt: new Date().toISOString() }).where(eq(s.reviews.id, id)).returning({ courseId: s.reviews.courseId })
  if (!r) return { ok: false }
  const [c] = await db.select({ slug: s.courses.slug }).from(s.courses).where(eq(s.courses.id, r.courseId))
  await audit(st.name, status === 'approved' ? 'publish' : 'hide', 'review', id, '', { before: cur.status, status })
  if (c) revalidatePath(`/courses/${c.slug}`)
  revalidatePath('/admin/reviews')
  return { ok: true }
}
