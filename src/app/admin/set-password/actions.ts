'use server'
import { redirect } from 'next/navigation'
import { setPasswordWithLink } from '@/server/staff-auth'
import { limited } from '@/server/ratelimit'

export async function setPassword(_: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const token = String(form.get('t') ?? '')
  const a = String(form.get('password') ?? '')
  const b = String(form.get('confirm') ?? '')
  if (a !== b) return { error: 'كلمتا المرور غير متطابقتين' }
  if (await limited('staff-setpw', 10, 15 * 60e3)) return { error: 'محاولات كثيرة — حاول بعد ربع ساعة' }
  const r = await setPasswordWithLink(token, a)
  if (!r.ok) return { error: r.error }
  redirect(r.twoStep ? '/admin/login' : '/admin')
}
