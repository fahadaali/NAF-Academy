'use server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { endSession, requestCode, safeNext, verifyCode } from '@/server/learner-auth'
import { limited } from '@/server/ratelimit'
import { db, schema as s } from '@/server/db'
import { currentLearner } from '@/server/learner-auth'
import { normalizePhone } from '@/lib/phone'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { IDENTITY_LABEL, identityGaps, lockedFields, normalizeDigits } from '@/lib/identity'
import { writeIdentity } from '@/server/identity'

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
  name: z.string().trim().max(120),
  nameEn: z.string().trim().max(120),
  nationalId: z.string().max(20).transform(normalizeDigits),
  phone: z.string().trim().max(20),
  org: z.string().trim().max(160),
  vatNumber: z.union([z.literal(''), z.string().regex(/^3\d{13}3$/, 'الرقم الضريبي 15 رقماً يبدأ وينتهي بـ 3')]),
  /** إقرار بأن البيانات صحيحة وتخصّه — شرط تثبيت الهوية أول مرة */
  confirm: z.boolean().default(false),
})

/** «ملفي»: البيانات الإلزامية (الاسمان ورقم الهوية والجوال) — رقم الهوية يثبت متى حُفظ، والاسمان متى اكتملت البيانات؛
    لا يغيّرها المتدرب بعدها (الفريق وحده). إكمال البيانات أول مرة بإقرار صريح، والجوال يتغيّر ولا يُفرَّغ. الجهة والرقم الضريبي اختياريان */
export async function saveProfileAction(raw: unknown): Promise<{ ok: boolean; error?: string }> {
  const me = await currentLearner()
  if (!me) return { ok: false, error: 'انتهت الجلسة — ادخل من جديد' }
  /* رسالة «الرقم مسجّل بحساب آخر» تكشف وجود الرقم — فالمحاولات محدودة */
  if (await limited('profile-save', 15, 10 * 60e3)) return { ok: false, error: 'محاولات كثيرة — انتظر قليلاً' }
  const p = profile.safeParse(raw)
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message }
  const v = p.data
  const phone = v.phone ? normalizePhone(v.phone) : ''
  if (v.phone && !phone) return { ok: false, error: 'رقم جوال غير صالح' }
  const lock = lockedFields(me)
  if ((lock.names && (v.name !== me.name.trim() || v.nameEn !== me.nameEn.trim())) || (lock.nationalId && v.nationalId && v.nationalId !== me.nationalId))
    return { ok: false, error: 'الاسم ورقم الهوية مثبّتة — لتصحيحها تواصل مع الأكاديمية' }
  /* ما ثبت يُؤخذ من القاعدة لا من النموذج */
  const next = {
    name: lock.names ? me.name : v.name, nameEn: lock.names ? me.nameEn : v.nameEn,
    nationalId: lock.nationalId ? me.nationalId : v.nationalId, phone: phone ?? '',
  }
  if (!next.name) return { ok: false, error: 'الاسم مطلوب' }
  if (next.nameEn && !/^[A-Za-z][A-Za-z .'-]*$/.test(next.nameEn)) return { ok: false, error: 'الاسم بالإنجليزية بحروف لاتينية' }
  const gaps = identityGaps(next)
  /* رقم الهوية لا يُحفظ إلا مع اكتمال البيانات كلها — فيثبت معها ولا يبقى اسم ناقص لا يُصحَّح */
  if (!lock.nationalId && next.nationalId && gaps.length) return { ok: false, error: `أكمل بصحة: ${gaps.map((g) => IDENTITY_LABEL[g]).join('، ')}` }
  if (lock.names && !next.phone) return { ok: false, error: 'الجوال مطلوب' }
  if (!lock.names && !gaps.length && !v.confirm) return { ok: false, error: 'أقرّ بصحة البيانات قبل الحفظ — لا يمكن تعديل الاسم ورقم الهوية بعده' }
  const r = await writeIdentity(me.id, { ...next, org: v.org, vatNumber: v.vatNumber })
  if (!r.ok) return r
  revalidatePath('/learn', 'layout')
  return { ok: true }
}
