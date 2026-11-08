/* اشتراك Web Push في المتصفح — مشترك بين زر الملف الشخصي وشريط الطلب الفوري.
   طلب الإذن يجب أن يُستدعى من نقرة المستخدم (سفاري والآيفون يرفضانه بدونها، وكروم يخفيه). */
import { savePushSubscription } from '@/site/push-actions'

export type PushState = 'unsupported' | 'denied' | 'off' | 'on'

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

const key = (b64: string) => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

/** حالة هذا الجهاز: مدعوم؟ محظور؟ مشترك؟ */
export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  try {
    const reg = await navigator.serviceWorker.getRegistration('/')
    return (await reg?.pushManager.getSubscription()) ? 'on' : 'off'
  } catch {
    return 'off'
  }
}

/** من نقرة: الإذن ← تسجيل عامل الخدمة ← الاشتراك ← حفظه للمتدرب */
export async function subscribePush(publicKey: string): Promise<{ state: PushState; error?: string }> {
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return { state: perm === 'denied' ? 'denied' : 'off' }
  const reg = (await navigator.serviceWorker.getRegistration('/')) ?? (await navigator.serviceWorker.register('/sw.js', { scope: '/' }))
  await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(publicKey) as BufferSource })
  const r = await savePushSubscription(sub.toJSON())
  if (r.ok) return { state: 'on' }
  await sub.unsubscribe()
  return { state: 'off', error: r.error ?? 'تعذّر' }
}
