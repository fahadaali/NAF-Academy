'use server'
/* تقييم الدورة — للمسجّل بعد بلوغ نصفها. التعديل يعيده للمراجعة. */
import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema as s } from '@/server/db'
import { currentLearner } from '@/server/learner-auth'
import { progressOf } from '@/server/notify/engine'
import { limited } from '@/server/ratelimit'
import { ANON_DISPLAY, REVIEW_MIN_PCT } from '@/lib/reviews'

const input = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(1200), anonymous: z.boolean() })

export async function submitReview(courseId: string, raw: unknown): Promise<{ ok: boolean; error?: string }> {
  const me = await currentLearner()
  if (!me) return { ok: false, error: 'انتهت الجلسة' }
  if (await limited('review', 20, 60 * 60e3)) return { ok: false, error: 'محاولات كثيرة' }
  const p = input.safeParse(raw)
  if (!p.success) return { ok: false, error: 'اختر تقييماً من 1 إلى 5' }
  const [en] = await db.select().from(s.enrollments).where(and(eq(s.enrollments.learnerId, me.id), eq(s.enrollments.courseId, courseId), eq(s.enrollments.status, 'active')))
  if (!en) return { ok: false, error: 'التقييم للمسجّلين' }
  const pct = (await progressOf([{ learnerId: me.id, courseId }])).get(`${me.id}:${courseId}`)?.pct ?? 0
  if (pct < REVIEW_MIN_PCT) return { ok: false, error: `يُتاح التقييم بعد إنجاز ${REVIEW_MIN_PCT}% من الدورة` }
  const parts = me.name.trim().split(/\s+/)
  const display = p.data.anonymous || !parts[0] ? ANON_DISPLAY : `${parts[0]}${parts[1] ? ` ${parts[1][0]}.` : ''}`
  const now = new Date().toISOString()
  await db.insert(s.reviews).values({ id: randomUUID(), learnerId: me.id, courseId, rating: p.data.rating, comment: p.data.comment, display })
    .onConflictDoUpdate({ target: [s.reviews.learnerId, s.reviews.courseId], set: { rating: p.data.rating, comment: p.data.comment, display, status: 'pending', updatedAt: now } })
  return { ok: true }
}
