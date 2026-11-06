import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { brandView } from '@/server/brand'
import { authReady, currentStaff, pendingStep } from '@/server/auth'
import { LoginForm } from './LoginForm'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'دخول اللوحة', robots: { index: false, follow: false } }

export default async function Login() {
  if (await currentStaff()) redirect('/admin')
  /* بعد تعيين كلمة مرور لحساب فيه تحقق ثنائي: الخطوة الثانية مباشرة */
  const step = await pendingStep()
  const note = authReady() ? undefined : 'الدخول غير مهيّأ: أضف السرّ ADMIN_SECRET (48 حرفاً عشوائياً) في Cloudflare ← Variables and Secrets ثم أعد النشر.'
  return <LoginForm brand={await brandView()} initial={step ? '2fa' : 'password'} note={note} />
}
