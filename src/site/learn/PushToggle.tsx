'use client'
/* «فعّل التنبيهات» — إذن المتصفح ثم اشتراك Web Push بمفتاح VAPID العام */
import { useEffect, useState } from 'react'
import { removePushSubscription, savePushSubscription } from '@/site/push-actions'
import st from './learn.module.css'

const key = (b64: string) => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

/** `before`: مواعيد تذكير الجلسة على هذه القناة كما ضُبطت في اللوحة، مثل «بساعة وبـ10 دقائق» */
export function PushToggle({ publicKey, before }: { publicKey: string; before: string }) {
  const [state, setState] = useState<'loading' | 'unsupported' | 'denied' | 'off' | 'on'>('loading')
  const [msg, setMsg] = useState('')
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return setState('unsupported')
    if (Notification.permission === 'denied') return setState('denied')
    navigator.serviceWorker.getRegistration('/').then(async (reg) => setState((await reg?.pushManager.getSubscription()) ? 'on' : 'off')).catch(() => setState('off'))
  }, [])
  const enable = async () => {
    setMsg('')
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return setState(perm === 'denied' ? 'denied' : 'off')
    const reg = (await navigator.serviceWorker.getRegistration('/')) ?? (await navigator.serviceWorker.register('/sw.js', { scope: '/' }))
    await navigator.serviceWorker.ready
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(publicKey) as BufferSource })
    const r = await savePushSubscription(sub.toJSON())
    if (r.ok) setState('on'); else { await sub.unsubscribe(); setMsg(r.error ?? 'تعذّر') }
  }
  const disable = async () => {
    const reg = await navigator.serviceWorker.getRegistration('/')
    const sub = await reg?.pushManager.getSubscription()
    if (sub) { await removePushSubscription(sub.endpoint); await sub.unsubscribe() }
    setState('off')
  }
  return (
    <section className={st.course} aria-labelledby="push-h">
      <h2 id="push-h">تنبيهات هذا الجهاز</h2>
      <p>{before ? `تذكير قبل الجلسة ${before}، ` : ''}وإشعار حين تصدر شهادتك — على هذا المتصفح.</p>
      {state === 'unsupported' && <p className={st.soon}>المتصفح لا يدعم التنبيهات. على آيفون: ثبّت الأكاديمية على الشاشة الرئيسية أولاً.</p>}
      {state === 'denied' && <p className={st.soon}>التنبيهات محظورة لهذا الموقع — اسمح بها من إعدادات المتصفح.</p>}
      {state === 'off' && <button className="btn" onClick={enable}>فعّل التنبيهات</button>}
      {state === 'on' && <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}><strong style={{ color: 'var(--success)' }}>✓ التنبيهات مفعّلة</strong><button className="btn ghost" onClick={disable}>أوقفها</button></div>}
      {msg && <p role="alert" className={st.soon}>{msg}</p>}
    </section>
  )
}
