'use server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { endSession, requestCode, safeNext, verifyCode } from '@/server/learner-auth'
import { limited } from '@/server/ratelimit'
import { db, schema as s } from '@/server/db'
import { currentLearner } from '@/server/learner-auth'
import { normalizePhone } from '@/lib/phone'
import { eq } from 'drizzle-orm'

const ch = z.enum(['email', 'sms'])

export async function sendCodeAction(channel: string, target: string) {
  if (await limited('otp-send', 8, 10 * 60e3)) return { ok: false, error: 'محاولات كثيرة — انتظر قليلاً' }
  const c = ch.safeParse(channel)
  if (!c.success) return { ok: false, error: 'قناة غير صالحة' }
  return requestCode(c.data, target)
}

export async function verifyCodeAction(channel: string, target: string, code: string, name?: string) {
  if (await limited('otp-verify', 20, 10 * 60e3)) return { ok: false, error: 'محاولات كثيرة — انتظر قليلاً' }
  const c = ch.safeParse(channel)
  if (!c.success) return { ok: false, error: 'قناة غير صالحة' }
  const r = await verifyCode(c.data, target, code.trim(), name)
  return r.ok ? { ok: true, learner: { name: r.learner!.name, email: r.learner!.email, phone: r.learner!.phone, org: r.learner!.org, vatNumber: r.learner!.vatNumber } } : { ok: false, error: r.error }
}

export async function logoutAction(all: boolean, next?: string) {
  await endSession(all)
  redirect(safeNext(next) === '/learn' ? '/' : safeNext(next))
}

const profile = z.object({
  name: z.string().trim().min(2, 'الاسم مطلوب').max(120),
  phone: z.string().trim().max(20),
  org: z.string().trim().max(160),
  /** بحروف لاتينية — للشهادة الثنائية */
  nameEn: z.union([z.literal(''), z.string().trim().max(120).regex(/^[A-Za-z][A-Za-z .'-]*$/, 'الاسم بالإنجليزية بحروف لاتينية')]).default(''),
  vatNumber: z.union([z.literal(''), z.string().regex(/^3\d{13}3$/, 'الرقم الضريبي 15 رقماً يبدأ وينتهي بـ 3')]),
})

export async function saveProfileAction(raw: unknown): Promise<{ ok: boolean; error?: string }> {
  const me = await currentLearner()
  if (!me) return { ok: false, error: 'انتهت الجلسة — ادخل من جديد' }
  const p = profile.safeParse(raw)
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message }
  const phone = p.data.phone ? normalizePhone(p.data.phone) : ''
  if (p.data.phone && !phone) return { ok: false, error: 'رقم جوال غير صالح' }
  if (phone) {
    const [other] = await db.select({ id: s.learners.id }).from(s.learners).where(eq(s.learners.phone, phone))
    if (other && other.id !== me.id) return { ok: false, error: 'هذا الجوال مرتبط بحساب آخر' }
  }
  await db.update(s.learners).set({ ...p.data, phone: phone ?? '', updatedAt: new Date().toISOString() }).where(eq(s.learners.id, me.id))
  return { ok: true }
}
