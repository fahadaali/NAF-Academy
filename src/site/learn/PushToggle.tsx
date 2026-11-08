'use client'
/* «فعّل التنبيهات» — إذن المتصفح ثم اشتراك Web Push بمفتاح VAPID العام */
import { useEffect, useState } from 'react'
import { removePushSubscription } from '@/site/push-actions'
import { pushState, subscribePush, type PushState } from '@/site/push/client'
import st from './learn.module.css'

/** `before`: مواعيد تذكير الجلسة على هذه القناة كما ضُبطت في اللوحة، مثل «بساعة وبـ10 دقائق» */
export function PushToggle({ publicKey, before }: { publicKey: string; before: string }) {
  const [state, setState] = useState<'loading' | PushState>('loading')
  const [msg, setMsg] = useState('')
  useEffect(() => { pushState().then(setState) }, [])
  const enable = async () => {
    setMsg('')
    const r = await subscribePush(publicKey)
    setState(r.state)
    if (r.error) setMsg(r.error)
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
