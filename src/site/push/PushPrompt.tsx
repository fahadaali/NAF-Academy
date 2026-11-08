'use client'
/* شريط «فعّل التنبيهات» فور فتح الصفحة — للمتدرب الداخل بحسابه، متى كانت القناة مفعّلة ولم يُقرَّر الإذن بعد.
   النقر على «فعّل» يفتح نافذة الإذن الأصلية (لا تُستدعى بلا نقرة). «لاحقاً» يخفيه أسبوعاً على هذا الجهاز. */
import { useEffect, useState } from 'react'
import { pushPublicKey } from '@/site/push-actions'
import { pushState, pushSupported, subscribePush } from './client'
import s from './push.module.css'

const LATER = 'naf-push-later'
const WEEK = 7 * 864e5

export function PushPrompt() {
  const [publicKey, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    /* صفحة الملف فيها زر التفعيل نفسه */
    if (!pushSupported() || Notification.permission !== 'default' || location.pathname.startsWith('/learn/profile')) return
    if (!/(?:^|; )naf_hi=/.test(document.cookie)) return
    try { if (Date.now() - Number(localStorage.getItem(LATER) ?? 0) < WEEK) return } catch {}
    let live = true
    pushState().then(async (st) => {
      if (st !== 'off') return
      const k = await pushPublicKey()
      if (live && k) setKey(k)
    })
    return () => { live = false }
  }, [])

  if (!publicKey) return null
  const later = () => { try { localStorage.setItem(LATER, String(Date.now())) } catch {}; setKey('') }
  const enable = async () => {
    setBusy(true)
    setMsg('')
    try {
      const r = await subscribePush(publicKey)
      if (r.state === 'on' || r.state === 'denied') return setKey('')
      if (r.error) setMsg(r.error)
      else later()
    } catch {
      setMsg('تعذّر تفعيل التنبيهات على هذا المتصفح')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className={`rise ${s.bar}`} role="region" aria-label="تنبيهات المتصفح">
      <p className={s.text}>فعّل التنبيهات لتصلك مواعيد الجلسات وإشعار شهادتك على هذا الجهاز.</p>
      <div className={s.actions}>
        <button type="button" className="btn" disabled={busy} onClick={enable}>{busy ? 'لحظة…' : 'فعّل'}</button>
        <button type="button" className="btn ghost" disabled={busy} onClick={later}>لاحقاً</button>
      </div>
      {msg && <p role="alert" className={s.err}>{msg}</p>}
    </div>
  )
}
