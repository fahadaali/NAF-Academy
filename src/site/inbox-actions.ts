'use server'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { currentLearner } from '@/server/learner-auth'
import { revalidatePath } from 'next/cache'

/** يعلّم إشعارات المتدرب نفسه مقروءة — لا يمسّ غيره */
export async function markInboxRead(): Promise<{ ok: boolean }> {
  const me = await currentLearner()
  if (!me) return { ok: false }
  await db.update(s.inbox).set({ readAt: new Date().toISOString() }).where(and(eq(s.inbox.learnerId, me.id), isNull(s.inbox.readAt)))
  revalidatePath('/learn', 'layout')
  return { ok: true }
}
