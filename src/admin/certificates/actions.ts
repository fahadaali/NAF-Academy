'use server'
/* الشهادات في اللوحة — الاعتماد (فردي وجماعي)، والرفض، والإلغاء، وإعادة الفحص، والقوالب.
   كل إجراء: صلاحية ← تحقق ← كتابة ← سجل ← إعادة توليد. */
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { and, eq, isNull, ne } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema as s } from '@/server/db'
import { courseScope, inScope, requirePermission, type Staff } from '@/server/auth'
import { audit } from '@/server/audit'
import { certBrand, issueCertificate, recheckCourse, regeneratePdf } from '@/server/certificates'
import { certificatePdf } from '@/server/certificates/pdf'
import { BLOCKS, DEFAULT_DESIGN, type CertDesign } from '@/lib/certificate'
import { inList } from '@/server/db/limits'

/** المدرب لا يمسّ إلا شهادات دوراته */
async function mine(st: Staff, id: string) {
  const scope = await courseScope(st)
  if (scope === null) return true
  const [c] = await db.select({ courseId: s.certificates.courseId }).from(s.certificates).where(eq(s.certificates.id, id))
  return !!c && inScope(scope, c.courseId)
}

const refresh = () => { revalidatePath('/admin/certificates', 'layout'); revalidatePath('/learn', 'layout') }

export async function approveCertificates(ids: string[]): Promise<{ ok: boolean; n: number }> {
  const st = await requirePermission('certificates.manage')
  let n = 0
  const list = z.array(z.string().uuid()).max(200).safeParse(ids)
  if (!list.success) return { ok: false, n: 0 }
  /* خطأ في شهادة لا يوقف بقية الدفعة */
  for (const id of list.data) {
    if (!(await mine(st, id))) continue
    try {
      const r = await issueCertificate(id, st.name)
      if (r?.status === 'issued') n++
    } catch (e) { console.error('approve certificate', id, e) }
  }
  refresh()
  return { ok: true, n }
}

const reasonInput = z.object({ id: z.string().uuid(), reason: z.string().trim().min(3, 'اذكر السبب').max(500) })

export async function rejectCertificate(raw: unknown): Promise<{ ok: boolean; error?: string }> {
  const st = await requirePermission('certificates.manage')
  const p = reasonInput.safeParse(raw)
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message }
  if (!(await mine(st, p.data.id))) return { ok: false, error: 'الشهادة غير موجودة' }
  const r = await db.update(s.certificates).set({ status: 'rejected', reason: p.data.reason, decidedBy: st.name, updatedAt: new Date().toISOString() })
    .where(and(eq(s.certificates.id, p.data.id), eq(s.certificates.status, 'pending'))).returning({ id: s.certificates.id })
  if (!r.length) return { ok: false, error: 'لا يمكن رفضها الآن' }
  await audit(st.name, 'reject', 'certificate', p.data.id, p.data.reason)
  refresh()
  return { ok: true }
}

export async function revokeCertificate(raw: unknown): Promise<{ ok: boolean; error?: string }> {
  const st = await requirePermission('certificates.manage')
  const p = reasonInput.safeParse(raw)
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message }
  if (!(await mine(st, p.data.id))) return { ok: false, error: 'الشهادة غير موجودة' }
  const now = new Date().toISOString()
  const r = await db.update(s.certificates).set({ status: 'revoked', reason: p.data.reason, revokedAt: now, decidedBy: st.name, updatedAt: now })
    .where(and(eq(s.certificates.id, p.data.id), eq(s.certificates.status, 'issued'))).returning({ code: s.certificates.code })
  if (!r.length) return { ok: false, error: 'الشهادة غير صادرة' }
  await audit(st.name, 'revoke', 'certificate', p.data.id, `${r[0].code} · ${p.data.reason}`)
  revalidatePath(`/certificates/${r[0].code}`)
  refresh()
  return { ok: true }
}

/** إعادة المرفوضة إلى المراجعة */
export async function reopenCertificate(id: string) {
  const st = await requirePermission('certificates.manage')
  if (!z.string().uuid().safeParse(id).success || !(await mine(st, id))) return { ok: false }
  await db.update(s.certificates).set({ status: 'pending', reason: '', updatedAt: new Date().toISOString() }).where(and(eq(s.certificates.id, id), eq(s.certificates.status, 'rejected')))
  await audit(st.name, 'reopen', 'certificate', id, '')
  refresh()
  return { ok: true }
}

export async function regenerateCertificate(id: string) {
  const st = await requirePermission('certificates.manage')
  if (!z.string().uuid().safeParse(id).success || !(await mine(st, id))) return { ok: false }
  await regeneratePdf(id)
  await audit(st.name, 'regenerate', 'certificate', id, '')
  refresh()
  return { ok: true }
}

export async function recheck(courseId: string): Promise<{ ok: boolean; n: number }> {
  const st = await requirePermission('certificates.manage')
  if (!inScope(await courseScope(st), courseId)) return { ok: false, n: 0 }
  const n = await recheckCourse(courseId, st.name)
  await audit(st.name, 'recheck', 'course', courseId, `${n} مستوفٍ`)
  refresh()
  return { ok: true, n }
}

/* ───────── القوالب ───────── */

const block = z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100), size: z.number().min(6).max(120), show: z.boolean() })
const designInput = z.object({
  tone: z.enum(['ivory', 'night']),
  backgroundId: z.string().nullable(),
  title: z.string().trim().min(1, 'العنوان مطلوب').max(80),
  lead: z.string().trim().max(120),
  courseLead: z.string().trim().max(120),
  hoursText: z.string().trim().max(120),
  english: z.boolean(),
  bilingual: z.boolean().default(false),
  en: z.object({ title: z.string().trim().max(80), lead: z.string().trim().max(120), courseLead: z.string().trim().max(120), hoursText: z.string().trim().max(120), issued: z.string().trim().max(40) })
    .default({ title: 'Certificate of Completion', lead: 'This certificate is awarded to', courseLead: 'for completing the requirements of', hoursText: '{{hours}} training hours', issued: 'Issued on' }),
  signatories: z.array(z.object({ name: z.string().trim().min(1, 'اسم الموقّع مطلوب').max(80), title: z.string().trim().max(80), titleEn: z.string().trim().max(80).optional(), signatureId: z.string().nullable() })).max(3),
  blocks: z.object(Object.fromEntries(BLOCKS.map((k) => [k, block])) as Record<(typeof BLOCKS)[number], typeof block>),
})
const templateInput = z.object({ name: z.string().trim().min(2, 'اسم القالب مطلوب').max(80), isDefault: z.boolean(), design: designInput })
export type TemplateInput = z.input<typeof templateInput>

/** الصور المسموحة في الشهادة: PNG وJPEG فقط (pdf-lib) */
async function checkImages(d: CertDesign) {
  const ids = [d.backgroundId, ...d.signatories.map((x) => x.signatureId)].filter(Boolean) as string[]
  if (!ids.length) return null
  const rows = await db.select({ id: s.media.id, mime: s.media.mime }).from(s.media).where(inList(s.media.id, ids))
  return rows.some((r) => r.mime !== 'image/png' && r.mime !== 'image/jpeg') ? 'صور الشهادة بصيغة PNG أو JPG فقط' : null
}

export async function saveTemplate(id: string | null, raw: TemplateInput): Promise<{ ok: true; id: string } | { ok: false; errors: Record<string, string> }> {
  const st = await requirePermission('certificates.manage')
  const p = templateInput.safeParse(raw)
  if (!p.success) return { ok: false, errors: Object.fromEntries(p.error.issues.map((i) => [i.path.join('.'), i.message])) }
  const bad = await checkImages(p.data.design)
  if (bad) return { ok: false, errors: { 'design.backgroundId': bad } }
  const tid = id ?? randomUUID()
  if (id) await db.update(s.certificateTemplates).set({ ...p.data, updatedAt: new Date().toISOString() }).where(eq(s.certificateTemplates.id, id))
  else await db.insert(s.certificateTemplates).values({ id: tid, ...p.data })
  if (p.data.isDefault) await db.update(s.certificateTemplates).set({ isDefault: false }).where(ne(s.certificateTemplates.id, tid))
  await audit(st.name, id ? 'update' : 'create', 'certificate_template', tid, p.data.name, p.data)
  refresh()
  return { ok: true, id: tid }
}

export async function deleteTemplate(id: string): Promise<{ ok: boolean; error?: string }> {
  const st = await requirePermission('certificates.manage')
  const live = await db.select({ id: s.certificateTemplates.id }).from(s.certificateTemplates).where(isNull(s.certificateTemplates.deletedAt))
  if (live.length <= 1) return { ok: false, error: 'لا بد من قالب واحد على الأقل' }
  await db.update(s.certificateTemplates).set({ deletedAt: new Date().toISOString(), isDefault: false }).where(eq(s.certificateTemplates.id, id))
  await audit(st.name, 'trash', 'certificate_template', id, '')
  refresh()
  return { ok: true }
}

/** معاينة PDF حقيقية بالقالب الحالي (قبل الحفظ) ببيانات تجريبية */
export async function previewTemplatePdf(design: CertDesign): Promise<string> {
  await requirePermission('certificates.manage')
  const d = designInput.parse(design)
  const bytes = await certificatePdf(d, {
    name: 'سارة عبدالله المتدربة', course: 'نظام الإثبات: من النص إلى المرافعة', hours: 12,
    date: new Intl.DateTimeFormat('ar-SA-u-nu-latn-ca-gregory', { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()),
    hijri: '—', code: 'NAF-DEMO-2026', verifyUrl: 'https://academy.example/certificates/NAF-DEMO-2026', nameEn: 'Sarah Abdullah', courseEn: 'Evidence Law: From Text to Pleading', dateEn: '5 November 2026',
  }, await certBrand(d.tone))
  return `data:application/pdf;base64,${Buffer.from(bytes).toString('base64')}`
}

export async function duplicateTemplate(id: string) {
  const st = await requirePermission('certificates.manage')
  const [t] = await db.select().from(s.certificateTemplates).where(eq(s.certificateTemplates.id, id))
  const nid = randomUUID()
  await db.insert(s.certificateTemplates).values({ id: nid, name: `${t?.name ?? 'قالب'} (نسخة)`, design: t?.design ?? DEFAULT_DESIGN, isDefault: false })
  await audit(st.name, 'duplicate', 'certificate_template', nid, '')
  refresh()
  return { ok: true, id: nid }
}
