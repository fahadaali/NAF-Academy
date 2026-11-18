import 'server-only'
/* كتابة هوية المتدرب — مدخل واحد للمتدرب («ملفي») والفريق (ملف المتدرب ولوحة الشهادات).
   رقم الهوية والجوال لحساب واحد: فحص قبل الكتابة برسالة واضحة، والفهرسان الفريدان يحرسان السباق بينهما. */
import { eq } from 'drizzle-orm'
import { db, schema as s } from './db'

export const NATIONAL_ID_TAKEN = 'رقم الهوية مسجّل بحساب آخر — تواصل مع الأكاديمية إن كان رقمك'
export const PHONE_TAKEN = 'هذا الجوال مرتبط بحساب آخر'

/** معرّف الحساب الآخر الذي يحمل رقم الهوية، أو null */
export async function nationalIdOwner(nationalId: string, exceptLearnerId: string) {
  if (!nationalId) return null
  const [r] = await db.select({ id: s.learners.id }).from(s.learners).where(eq(s.learners.nationalId, nationalId))
  return r && r.id !== exceptLearnerId ? r.id : null
}

async function phoneOwner(phone: string, exceptLearnerId: string) {
  if (!phone) return null
  const [r] = await db.select({ id: s.learners.id }).from(s.learners).where(eq(s.learners.phone, phone))
  return r && r.id !== exceptLearnerId ? r.id : null
}

/** خطأ الفهرس الفريد — libsql يضعه في cause، وD1 في الرسالة */
export const isNationalIdConflict = (e: unknown) => /learners\.national_id|learners_national_id/.test(errText(e))
const isPhoneConflict = (e: unknown) => /learners\.phone|learners_phone/.test(errText(e))
const errText = (e: unknown) => `${String(e)} ${String((e as { cause?: unknown })?.cause ?? '')}`

export type IdentityPatch = Partial<Pick<typeof s.learners.$inferInsert, 'name' | 'nameEn' | 'nationalId' | 'phone' | 'org' | 'vatNumber'>>

/** يكتب ما تغيّر من الهوية بعد فحص التفرّد، ثم يصدر الشهادات المعلّقة بانتظار رقم الهوية (الاعتماد التلقائي) */
export async function writeIdentity(learnerId: string, patch: IdentityPatch): Promise<{ ok: true } | { ok: false; error: string }> {
  if (patch.nationalId && (await nationalIdOwner(patch.nationalId, learnerId))) return { ok: false, error: NATIONAL_ID_TAKEN }
  if (patch.phone && (await phoneOwner(patch.phone, learnerId))) return { ok: false, error: PHONE_TAKEN }
  const [before] = await db.select({ nationalId: s.learners.nationalId }).from(s.learners).where(eq(s.learners.id, learnerId))
  if (!before) return { ok: false, error: 'الحساب غير موجود' }
  try {
    await db.update(s.learners).set({ ...patch, updatedAt: new Date().toISOString() }).where(eq(s.learners.id, learnerId))
  } catch (e) {
    if (isNationalIdConflict(e)) return { ok: false, error: NATIONAL_ID_TAKEN }
    if (isPhoneConflict(e)) return { ok: false, error: PHONE_TAKEN }
    throw e
  }
  /* الإصدار لا يُفشل الحفظ */
  if (patch.nationalId && patch.nationalId !== before.nationalId) {
    try {
      const { issueAwaitingId } = await import('./certificates')
      await issueAwaitingId(learnerId)
    } catch (e) { console.error('issue awaiting id', e) }
  }
  return { ok: true }
}
