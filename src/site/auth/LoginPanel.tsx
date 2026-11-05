'use client'
import { useRouter } from 'next/navigation'
import { CodeLogin } from './CodeLogin'
import s from './auth.module.css'

export function LoginPanel({ channels, next }: { channels: ('email' | 'sms')[]; next: string }) {
  const router = useRouter()
  if (!channels.length)
    return (
      <div className={s.card}>
        <strong>الدخول للمتدربين يُفعَّل قريباً.</strong>
        <p className={s.sent}>حتى ذلك الحين، رابط صفحة طلبك الذي وصلك عند التسجيل هو إيصالك ومدخلك.</p>
      </div>
    )
  return (
    <div className={s.card}>
      <CodeLogin channels={channels} onDone={() => { router.replace(next); router.refresh() }} />
      <p className={s.sent} style={{ fontSize: 13 }}>لا حاجة لكلمة مرور. أول دخول بالبريد ينشئ حسابك، ويرتبط تلقائياً بطلباتك السابقة بالبريد نفسه.</p>
    </div>
  )
}
