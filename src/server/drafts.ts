import 'server-only'
import { and, eq, gt } from 'drizzle-orm'
import { db, schema as s } from './db'
import type { CourseDraft } from '@/admin/schemas'

/** مسودة الدورة السارية (للمعاينة برمزها فقط) */
export async function courseDraft(courseId: string): Promise<CourseDraft | null> {
  const [r] = await db.select().from(s.drafts).where(and(eq(s.drafts.key, `course:${courseId}`), gt(s.drafts.expiresAt, new Date().toISOString())))
  return (r?.value as CourseDraft) ?? null
}
