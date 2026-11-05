'use server'
/* اشتراك المتدرب في إشعارات المتصفح — لكل جهاز اشتراك */
import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema as s } from '@/server/db'
import { currentLearner } from '@/server/learner-auth'
import { channelOpen } from '@/server/notify/channels'

const sub = z.object({ endpoint: z.string().url().regex(/^https:\/\//).max(1000), keys: z.object({ p256dh: z.string().min(40).max(200), auth: z.string().min(10).max(100) }) })

export async function savePushSubscription(raw: unknown): Promise<{ ok: boolean; error?: string }> {
  const me = await currentLearner()
  if (!me) return { ok: false, error: 'انتهت الجلسة' }
  if (!(await channelOpen('push'))) return { ok: false, error: 'التنبيهات غير متاحة بعد' }
  const p = sub.safeParse(raw)
  if (!p.success) return { ok: false, error: 'اشتراك غير صالح' }
  await db.insert(s.pushSubscriptions).values({ id: randomUUID(), learnerId: me.id, endpoint: p.data.endpoint, p256dh: p.data.keys.p256dh, auth: p.data.keys.auth })
    .onConflictDoUpdate({ target: s.pushSubscriptions.endpoint, set: { learnerId: me.id, p256dh: p.data.keys.p256dh, auth: p.data.keys.auth, updatedAt: new Date().toISOString() } })
  return { ok: true }
}

export async function removePushSubscription(endpoint: string): Promise<{ ok: boolean }> {
  const me = await currentLearner()
  if (!me) return { ok: false }
  await db.delete(s.pushSubscriptions).where(and(eq(s.pushSubscriptions.endpoint, endpoint), eq(s.pushSubscriptions.learnerId, me.id)))
  return { ok: true }
}
