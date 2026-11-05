'use server'
/* عقود المؤسسات من اللوحة — الحفظ، ورفع الملف الموقّع (تخزين خاص)، وتخصيص المقاعد وإلغاؤها. */
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { and, count, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema as s } from '@/server/db'
import { requirePermission } from '@/server/auth'
import { audit } from '@/server/audit'
import { putObject } from '@/server/storage'
import { assignContractSeat } from '@/server/contracts'
import { contractInput, errorsOf, type ContractInput, type Errors } from '@/admin/schemas'

const refresh = (orgId: string) => { revalidatePath(`/admin/organizations/${orgId}`); revalidatePath('/learn/org') }

export async function saveContract(orgId: string, id: string | null, raw: ContractInput): Promise<{ ok: true; id: string } | { ok: false; errors: Errors; message?: string }> {
  const st = await requirePermission('corporate.manage')
  if (!z.string().uuid().safeParse(orgId).success || (id && !z.string().uuid().safeParse(id).success)) return { ok: false, errors: {}, message: 'طلب غير صالح' }
  const p = contractInput.safeParse(raw)
  if (!p.success) return { ok: false, errors: errorsOf(p.error), message: 'راجع الحقول' }
  const v = { ...p.data, courseIds: p.data.scope === 'courses' ? p.data.courseIds : [] }
  if (id) {
    /* لا تُخفَّض السعة تحت المخصّص فعلاً */
    const [u] = await db.select({ n: count() }).from(s.enrollments).where(and(eq(s.enrollments.contractId, id), eq(s.enrollments.status, 'active')))
    if (v.seats < u.n) return { ok: false, errors: { seats: `خُصّص ${u.n} مقعد — لا تقلّ السعة عنه` } }
    await db.update(s.orgContracts).set({ ...v, updatedAt: new Date().toISOString() }).where(and(eq(s.orgContracts.id, id), eq(s.orgContracts.orgId, orgId)))
  }
  const cid = id ?? randomUUID()
  if (!id) await db.insert(s.orgContracts).values({ ...v, id: cid, orgId })
  await audit(st.name, id ? 'update' : 'create', 'contract', cid, v.title, v)
  refresh(orgId)
  return { ok: true, id: cid }
}

const MAX = 15 * 1024 * 1024
/** ملف العقد الموقّع — PDF في التخزين الخاص، لا يُنزَّل إلا لمن يدير المؤسسات */
export async function uploadContractFile(form: FormData): Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }> {
  const st = await requirePermission('corporate.manage')
  const file = form.get('file')
  if (!(file instanceof File) || !file.size) return { ok: false, error: 'لم يُرفق ملف' }
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return { ok: false, error: 'العقد بصيغة PDF' }
  if (file.size > MAX) return { ok: false, error: 'الحد الأقصى 15 ميغابايت' }
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') return { ok: false, error: 'الملف ليس PDF صالحاً' }
  const id = randomUUID()
  const name = file.name.slice(0, 200)
  await putObject(`ctr-${id}.pdf`, bytes, 'application/pdf')
  await db.insert(s.assets).values({ id, key: `ctr-${id}.pdf`, name, mime: 'application/pdf', size: bytes.length, scope: 'contract' })
  await audit(st.name, 'upload', 'asset', id, name)
  return { ok: true, id, name }
}

export async function assignFromContract(contractId: string, raw: { email: string; name: string; courseId: string; cohortId?: string | null }): Promise<{ ok: boolean; error?: string }> {
  const st = await requirePermission('corporate.manage')
  const p = z.object({ email: z.string().max(160), name: z.string().max(120), courseId: z.string().uuid(), cohortId: z.string().uuid().nullable().optional() }).safeParse(raw)
  if (!p.success || !z.string().uuid().safeParse(contractId).success) return { ok: false, error: 'بيانات غير صالحة' }
  const r = await assignContractSeat(contractId, p.data, st.name)
  const [c] = await db.select({ orgId: s.orgContracts.orgId }).from(s.orgContracts).where(eq(s.orgContracts.id, contractId))
  if (c) refresh(c.orgId)
  return r
}

/** تحرير مقعد: يُلغى التسجيل فيعود المقعد للعقد (التقدّم محفوظ إن أُعيد) */
export async function releaseContractSeat(enrollmentId: string): Promise<{ ok: boolean; error?: string }> {
  const st = await requirePermission('corporate.manage')
  if (!z.string().uuid().safeParse(enrollmentId).success) return { ok: false, error: 'طلب غير صالح' }
  const [e] = await db.select().from(s.enrollments).where(eq(s.enrollments.id, enrollmentId))
  if (!e?.contractId) return { ok: false, error: 'ليس مقعد عقد' }
  await db.update(s.enrollments).set({ status: 'canceled', updatedAt: new Date().toISOString() }).where(eq(s.enrollments.id, enrollmentId))
  await audit(st.name, 'release', 'contract', e.contractId, `تحرير مقعد ${enrollmentId}`)
  const [c] = await db.select({ orgId: s.orgContracts.orgId }).from(s.orgContracts).where(eq(s.orgContracts.id, e.contractId))
  if (c) refresh(c.orgId)
  return { ok: true }
}
