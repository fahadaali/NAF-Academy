'use server'
/* مسودات المعاينة — ما في المحرّر قبل الحفظ، لمعاينة الصفحة كاملة. لا تمسّ الدورة نفسها، وتنتهي بعد ساعة. */
import { lt } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema as s } from '@/server/db'
import { requirePermission } from '@/server/auth'
import { courseDraftInput } from '@/admin/schemas'

const TTL = 60 * 60e3

export async function stageCourseDraft(courseId: string, raw: unknown): Promise<{ ok: boolean }> {
  await requirePermission('content.write')
  if (!z.string().uuid().safeParse(courseId).success) return { ok: false }
  const p = courseDraftInput.safeParse(raw)
  if (!p.success) return { ok: false }
  const now = new Date()
  const expiresAt = new Date(now.getTime() + TTL).toISOString()
  await db.insert(s.drafts).values({ key: `course:${courseId}`, value: p.data, expiresAt })
    .onConflictDoUpdate({ target: s.drafts.key, set: { value: p.data, expiresAt } })
  /* تنظيف ما انتهى */
  await db.delete(s.drafts).where(lt(s.drafts.expiresAt, now.toISOString()))
  return { ok: true }
}
