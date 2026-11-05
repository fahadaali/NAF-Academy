'use server'
/* مسؤول المؤسسة: تخصيص مقعد من مقاعد مؤسسته لبريد موظف */
import { revalidatePath } from 'next/cache'
import { currentLearner } from '@/server/learner-auth'
import { managedOrgs, seatBelongsTo } from '@/server/orgs'
import { assignSeatCore } from '@/server/seats'
import { limited } from '@/server/ratelimit'
import { assignContractSeat } from '@/server/contracts'
import { eq } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'

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

/** مسؤول المؤسسة: مقعد من عقد مؤسسته لموظف في دورة من نطاق العقد */
export async function assignOrgContractSeat(orgId: string, contractId: string, v: { email: string; name: string; courseId: string; cohortId?: string | null }): Promise<{ ok: boolean; error?: string }> {
  const me = await currentLearner()
  if (!me) return { ok: false, error: 'انتهت الجلسة' }
  if (await limited('org-seat', 60, 60 * 60e3)) return { ok: false, error: 'محاولات كثيرة' }
  const orgs = await managedOrgs(me.id)
  const [c] = typeof contractId === 'string' ? await db.select({ orgId: s.orgContracts.orgId }).from(s.orgContracts).where(eq(s.orgContracts.id, contractId)) : []
  if (!orgs.some((o) => o.id === orgId) || c?.orgId !== orgId) return { ok: false, error: 'العقد ليس من عقود مؤسستك' }
  if (typeof v?.courseId !== 'string' || typeof v.email !== 'string') return { ok: false, error: 'بيانات غير صالحة' }
  const r = await assignContractSeat(contractId, { email: v.email, name: String(v.name ?? ''), courseId: v.courseId, cohortId: typeof v.cohortId === 'string' ? v.cohortId : null }, `مسؤول المؤسسة: ${me.email}`)
  revalidatePath('/learn/org')
  return r
}
