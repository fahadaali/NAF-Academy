'use server'
import { redirect } from 'next/navigation'
import { adminPassword, createSession, destroySession, safeEqual } from '@/server/auth'

export async function login(_: unknown, form: FormData): Promise<{ error?: string }> {
  const expected = adminPassword()
  const given = String(form.get('password') ?? '')
  if (!expected) return { error: 'لم تُضبط كلمة مرور اللوحة في البيئة.' }
  /* تأخير ثابت يبطئ التخمين */
  await new Promise((r) => setTimeout(r, 400))
  if (!safeEqual(given, expected)) return { error: 'كلمة المرور غير صحيحة.' }
  await createSession(String(form.get('name') || 'مدير الأكاديمية').slice(0, 60))
  redirect('/admin')
}

export async function logout() {
  await destroySession()
  redirect('/admin/login')
}
