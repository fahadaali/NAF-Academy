'use server'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema as s } from '@/server/db'
import { acceptInvite, inviteTarget } from '@/server/invites'
import { limited } from '@/server/ratelimit'
import { startSession } from '@/server/learner-auth'
import { normalizePhone } from '@/lib/phone'

export type AcceptState = { error?: string; fields?: Record<string, string> }

const input = z.object({
  name: z.string().trim().min(3, 'الاسم الكامل مطلوب — كما تريده في الشهادة').max(120),
  phone: z.string().trim().min(1, 'رقم الجوال مطلوب').max(20),
  /** بحروف لاتينية — للشهادة الثنائية */
  nameEn: z.union([z.literal(''), z.string().trim().max(120).regex(/^[A-Za-z][A-Za-z .'-]*$/, 'الاسم بالإنجليزية بحروف لاتينية')]),
  org: z.string().trim().max(160),
})

/** قبول الدعوة: البيانات ← تسجيل بالمقعد المحجوز ← دخول مباشر إلى مساحة التعلّم */
export async function acceptAction(_: AcceptState, form: FormData): Promise<AcceptState> {
  if (await limited('invite', 12, 10 * 60e3)) return { error: 'محاولات كثيرة — حاول بعد دقائق' }
  const token = String(form.get('t') ?? '')
  const p = input.safeParse({ name: form.get('name') ?? '', phone: form.get('phone') ?? '', nameEn: form.get('nameEn') ?? '', org: form.get('org') ?? '' })
  if (!p.success) {
    const fields: Record<string, string> = {}
    for (const i of p.error.issues) fields[String(i.path[0])] ??= i.message
    return { error: 'راجع البيانات المعلّمة', fields }
  }
  const phone = normalizePhone(p.data.phone)
  if (!phone) return { error: 'راجع البيانات المعلّمة', fields: { phone: 'رقم جوال غير صالح' } }
  const target = await inviteTarget(token)
  if (!target) return { error: 'الرابط منتهٍ أو استُخدم — اطلب دعوة جديدة من إدارة البرنامج' }
  /* الجوال طريق دخول — لا يُربط بحساب غير صاحبه */
  const [other] = await db.select({ email: s.learners.email }).from(s.learners).where(eq(s.learners.phone, phone))
  if (other && other.email !== target.invite.email) return { error: 'راجع البيانات المعلّمة', fields: { phone: 'هذا الجوال مرتبط بحساب آخر' } }
  const r = await acceptInvite(token, { ...p.data, phone })
  if (!r.ok) return { error: r.error }
  await startSession(r.learnerId, p.data.name)
  redirect(`/learn/${r.slug}`)
}
