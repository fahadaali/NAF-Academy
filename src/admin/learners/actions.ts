'use server'
/* إضافة المشاركين إلى دورة من اللوحة — تسجيل مباشر أو دعوة بالبريد — وإدارة الدعوات.
   كل إجراء: صلاحية ← نطاق الدورة ← تحقق zod ← كتابة (مع سجلّها) ← إعادة توليد. الدفعات من المتصفح 25 صفاً (حد D1). */
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema as s } from '@/server/db'
import { courseScope, inScope, requirePermission } from '@/server/auth'
import { enrollDirect } from '@/server/enroll'
import { closeInvitesFor, createInvites, inviteLink, resendInvite, revokeInvite, type InviteOutcome } from '@/server/invites'
import { inviteState } from '@/lib/invites'
import { ROSTER_BATCH } from '@/lib/roster'

const rowsInput = z.array(z.object({
  email: z.string().trim().toLowerCase().email('بريد غير صالح').max(160),
  name: z.string().trim().max(120),
  phone: z.string().trim().max(20),
})).min(1).max(ROSTER_BATCH)
const ids = z.object({ courseId: z.string().uuid(), cohortId: z.string().uuid().nullable() })

async function guard(courseId: string) {
  const st = await requirePermission('sales.orders')
  return inScope(await courseScope(st), courseId) ? st : null
}
const refresh = (courseId: string) => revalidatePath(`/admin/courses/${courseId}/learners`)

export type EnrollOutcome = { email: string; status: 'enrolled' | 'renewed' | 'already' | 'error'; error?: string }

/** تسجيل مباشر بلا طلب ولا دفع (مصدره «منحة») — يصل كل مشارك بريد الترحيب، ومن له دعوة مفتوحة تُغلق فيتحرر مقعدها */
export async function bulkEnroll(courseId: string, cohortId: string | null, raw: unknown): Promise<{ ok: true; results: EnrollOutcome[] } | { ok: false; error: string }> {
  const st = await guard(courseId)
  if (!st) return { ok: false, error: 'الدورة خارج صلاحيتك' }
  const k = ids.safeParse({ courseId, cohortId })
  const p = rowsInput.safeParse(raw)
  if (!k.success || !p.success) return { ok: false, error: p.success ? 'بيانات غير صالحة' : p.error.issues[0]?.message ?? 'بيانات غير صالحة' }
  const results: EnrollOutcome[] = []
  for (const r of p.data) {
    const x = await enrollDirect({ courseId, cohortId, learner: { name: r.name, email: r.email, phone: r.phone }, source: 'grant', by: st.name })
    if (x.ok && x.status !== 'already') await closeInvitesFor(courseId, r.email)
    results.push(x.ok ? { email: r.email, status: x.status } : { email: r.email, status: 'error', error: x.error })
  }
  refresh(courseId)
  return { ok: true, results }
}

/** دعوات بالبريد — كل دعوة تحجز مقعداً حتى تُقبل أو تُلغى أو تنتهي */
export async function bulkInvite(courseId: string, cohortId: string | null, raw: unknown): Promise<{ ok: true; results: InviteOutcome[] } | { ok: false; error: string }> {
  const st = await guard(courseId)
  if (!st) return { ok: false, error: 'الدورة خارج صلاحيتك' }
  const k = ids.safeParse({ courseId, cohortId })
  const p = rowsInput.safeParse(raw)
  if (!k.success || !p.success) return { ok: false, error: p.success ? 'بيانات غير صالحة' : p.error.issues[0]?.message ?? 'بيانات غير صالحة' }
  const r = await createInvites(courseId, cohortId, p.data, st.name)
  refresh(courseId)
  return r
}

async function inviteGuard(id: string) {
  if (!z.string().uuid().safeParse(id).success) return null
  const [r] = await db.select().from(s.invitations).where(eq(s.invitations.id, id))
  if (!r) return null
  const st = await guard(r.courseId)
  return st ? { st, r } : null
}

export async function resendInviteAction(id: string): Promise<{ ok: true; link: string; mailed: boolean } | { ok: false; error: string }> {
  const g = await inviteGuard(id)
  if (!g) return { ok: false, error: 'الدعوة غير موجودة' }
  const r = await resendInvite(id, g.st.name)
  refresh(g.r.courseId)
  return r
}

export async function revokeInviteAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await inviteGuard(id)
  if (!g) return { ok: false, error: 'الدعوة غير موجودة' }
  const r = await revokeInvite(id, g.st.name)
  refresh(g.r.courseId)
  return r
}

/** رابط الدعوة القائم للنسخ (لا يغيّره) — للدعوة المفتوحة فقط */
export async function inviteLinkAction(id: string): Promise<{ ok: true; link: string } | { ok: false; error: string }> {
  const g = await inviteGuard(id)
  if (!g) return { ok: false, error: 'الدعوة غير موجودة' }
  if (inviteState(g.r) !== 'pending') return { ok: false, error: 'الدعوة ليست مفتوحة — أعد إرسالها' }
  return { ok: true, link: await inviteLink(g.r) }
}
