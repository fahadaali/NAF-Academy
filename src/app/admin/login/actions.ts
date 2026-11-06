'use server'
/* دخول الفريق: بريد وكلمة مرور، ثم رمز تطبيق المصادقة لمن فعّله. محاولات محدودة لكل عنوان، وقفل الحساب في القاعدة. */
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { destroySession } from '@/server/auth'
import { finishSecondStep, loginWithPassword, sendResetEmail } from '@/server/staff-auth'
import { failures, limited } from '@/server/ratelimit'

export type LoginState = { step: 'password' | '2fa' | 'forgot' | 'sent'; error?: string; mail?: boolean; email?: string }

const creds = z.object({ email: z.string().trim().toLowerCase().email('بريد غير صالح').max(160), password: z.string().min(1, 'أدخل كلمة المرور').max(200) })

export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get('email') ?? '').slice(0, 160)
  const p = creds.safeParse({ email, password: form.get('password') })
  if (!p.success) return { step: 'password', error: p.error.issues[0]?.message, email }
  /* الحدّ لكل جهاز يحتسب المحاولات الخاطئة وحدها */
  const gate = await failures('staff-login', 20, 15 * 60e3)
  if (gate.blocked()) return { step: 'password', error: 'محاولات خاطئة كثيرة من هذا الجهاز — حاول بعد ربع ساعة', email }
  const r = await loginWithPassword(p.data.email, p.data.password)
  if (!r.ok) { gate.fail(); return { step: 'password', error: r.error, email } }
  if (r.next === '2fa') return { step: '2fa' }
  redirect('/admin')
}

export async function secondStep(_: LoginState, form: FormData): Promise<LoginState> {
  const code = String(form.get('code') ?? '').replace(/\s/g, '')
  if (!/^\d{6}$/.test(code)) return { step: '2fa', error: 'الرمز 6 أرقام' }
  const gate = await failures('staff-2fa', 20, 15 * 60e3)
  if (gate.blocked()) return { step: '2fa', error: 'محاولات خاطئة كثيرة — حاول بعد ربع ساعة' }
  const r = await finishSecondStep(code)
  if (!r.ok) gate.fail()
  if (!r.ok) return { step: r.error?.startsWith('ادخل') || r.error?.startsWith('انتهت') ? 'password' : '2fa', error: r.error }
  redirect('/admin')
}

export async function forgot(_: LoginState, form: FormData): Promise<LoginState> {
  const email = z.string().trim().toLowerCase().email().max(160).safeParse(form.get('email'))
  if (!email.success) return { step: 'forgot', error: 'بريد غير صالح' }
  if (await limited('staff-forgot', 5, 15 * 60e3)) return { step: 'forgot', error: 'طلبات كثيرة — حاول بعد ربع ساعة' }
  const r = await sendResetEmail(email.data)
  return { step: 'sent', mail: r.mail }
}

export async function logout() {
  await destroySession()
  redirect('/admin/login')
}
