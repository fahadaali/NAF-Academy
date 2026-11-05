'use server'
/* المؤسسات في اللوحة — مسار طلبات «للمؤسسات»، وحسابات المؤسسات ومسؤولوها، ومن يُبلَّغ بالطلبات. */
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema as s } from '@/server/db'
import { requirePermission } from '@/server/auth'
import { audit } from '@/server/audit'
import { setSetting } from '@/server/settings'
import { upsertLearner } from '@/server/sales'
import { CORP_STATUS } from '@/server/db/schema'

const refresh = () => { revalidatePath('/admin/corporate'); revalidatePath('/admin/organizations', 'layout'); revalidatePath('/learn', 'layout') }

export async function updateRequest(id: string, raw: { status: string; notes: string }): Promise<{ ok: boolean }> {
  const st = await requirePermission('corporate.manage')
  const v = z.object({ status: z.enum(CORP_STATUS), notes: z.string().max(5000) }).parse(raw)
  await db.update(s.corporateRequests).set({ ...v, updatedAt: new Date().toISOString() }).where(eq(s.corporateRequests.id, id))
  await audit(st.name, 'update', 'corporate_request', id, v.status)
  refresh()
  return { ok: true }
}

export async function saveCorporateNotify(emails: string): Promise<{ ok: boolean; error?: string }> {
  const st = await requirePermission('corporate.manage')
  const list = [...new Set(emails.split(/[,\s،]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))]
  if (list.some((e) => !z.string().email().safeParse(e).success)) return { ok: false, error: 'بريد غير صالح في القائمة' }
  await setSetting('corporate', { notify: list.slice(0, 10) })
  await audit(st.name, 'update', 'settings', 'corporate', list.join(', '))
  refresh()
  return { ok: true }
}

const domain = z.string().trim().toLowerCase().regex(/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'نطاق غير صالح')
const orgInput = z.object({ name: z.string().trim().min(2, 'الاسم مطلوب').max(160), domains: z.array(domain).max(10), notes: z.string().max(5000) })

export async function saveOrganization(id: string | null, raw: unknown): Promise<{ ok: boolean; id?: string; error?: string }> {
  const st = await requirePermission('corporate.manage')
  const p = orgInput.safeParse(raw)
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message }
  const oid = id ?? randomUUID()
  if (id) await db.update(s.organizations).set({ ...p.data, updatedAt: new Date().toISOString() }).where(eq(s.organizations.id, id))
  else await db.insert(s.organizations).values({ id: oid, ...p.data })
  await audit(st.name, id ? 'update' : 'create', 'organization', oid, p.data.name, p.data)
  refresh()
  return { ok: true, id: oid }
}

/** إنشاء حساب مؤسسة من طلب، بنطاق بريد المتواصل إن كان بريداً مؤسسياً */
export async function organizationFromRequest(requestId: string): Promise<{ ok: boolean; id?: string }> {
  const st = await requirePermission('corporate.manage')
  const [r] = await db.select().from(s.corporateRequests).where(eq(s.corporateRequests.id, requestId))
  if (!r) return { ok: false }
  if (r.organizationId) return { ok: true, id: r.organizationId }
  const d = r.contact.includes('@') ? r.contact.split('@')[1].toLowerCase() : ''
  const personal = /^(gmail|hotmail|outlook|yahoo|icloud|live)\./.test(d)
  const id = randomUUID()
  await db.insert(s.organizations).values({ id, name: r.org, domains: d && !personal ? [d] : [], notes: `من طلب ${r.name}` })
  await db.update(s.corporateRequests).set({ organizationId: id, status: r.status === 'new' ? 'contacted' : r.status }).where(eq(s.corporateRequests.id, requestId))
  if (r.contact.includes('@')) {
    const l = await upsertLearner({ name: r.name, email: r.contact, phone: '', org: r.org, vatNumber: '' })
    await db.insert(s.orgMembers).values({ orgId: id, learnerId: l.id, role: 'manager' }).onConflictDoNothing()
  }
  await audit(st.name, 'create', 'organization', id, `من طلب ${r.org}`)
  refresh()
  return { ok: true, id }
}

export async function addOrgMember(orgId: string, raw: { email: string; name: string; role: 'manager' | 'member' }): Promise<{ ok: boolean; error?: string }> {
  const st = await requirePermission('corporate.manage')
  const p = z.object({ email: z.string().trim().toLowerCase().email('بريد غير صالح'), name: z.string().trim().max(120), role: z.enum(['manager', 'member']) }).safeParse(raw)
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message }
  const [o] = await db.select().from(s.organizations).where(eq(s.organizations.id, orgId))
  if (!o) return { ok: false, error: 'المؤسسة غير موجودة' }
  const l = await upsertLearner({ name: p.data.name, email: p.data.email, phone: '', org: o.name, vatNumber: '' })
  await db.insert(s.orgMembers).values({ orgId, learnerId: l.id, role: p.data.role }).onConflictDoUpdate({ target: [s.orgMembers.orgId, s.orgMembers.learnerId], set: { role: p.data.role } })
  await audit(st.name, 'member', 'organization', orgId, `${p.data.email} · ${p.data.role}`)
  refresh()
  return { ok: true }
}

export async function removeOrgMember(orgId: string, learnerId: string) {
  const st = await requirePermission('corporate.manage')
  await db.delete(s.orgMembers).where(and(eq(s.orgMembers.orgId, orgId), eq(s.orgMembers.learnerId, learnerId)))
  await audit(st.name, 'unmember', 'organization', orgId, learnerId)
  refresh()
  return { ok: true }
}

export async function archiveOrganization(id: string) {
  const st = await requirePermission('corporate.manage')
  await db.update(s.organizations).set({ deletedAt: new Date().toISOString() }).where(eq(s.organizations.id, id))
  await audit(st.name, 'trash', 'organization', id, '')
  refresh()
  return { ok: true }
}
