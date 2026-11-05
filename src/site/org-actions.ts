'use server'
/* مسؤول المؤسسة: تخصيص مقعد من مقاعد مؤسسته لبريد موظف */
import { revalidatePath } from 'next/cache'
import { currentLearner } from '@/server/learner-auth'
import { managedOrgs, seatBelongsTo } from '@/server/orgs'
import { assignSeatCore } from '@/server/seats'
import { limited } from '@/server/ratelimit'

export async function assignOrgSeat(orgId: string, grantId: string, email: string, name: string): Promise<{ ok: boolean; error?: string }> {
  const me = await currentLearner()
  if (!me) return { ok: false, error: 'انتهت الجلسة' }
  if (await limited('org-seat', 60, 60 * 60e3)) return { ok: false, error: 'محاولات كثيرة' }
  const orgs = await managedOrgs(me.id)
  if (!orgs.some((o) => o.id === orgId) || !(await seatBelongsTo(orgId, grantId))) return { ok: false, error: 'المقعد ليس من مقاعد مؤسستك' }
  const r = await assignSeatCore(grantId, email, name, `مسؤول المؤسسة: ${me.email}`)
  revalidatePath('/learn/org')
  return { ok: r.ok, error: r.error }
}
