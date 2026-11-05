'use client'
/* الدخول برمز لمرة واحدة — يُستعمل في صفحة الدخول وداخل صفحة الدفع. */
import { useEffect, useRef, useState } from 'react'
import { sendCodeAction, verifyCodeAction } from '@/site/auth-actions'
import s from './auth.module.css'

export type Verified = { name: string; email: string; phone: string; org: string; vatNumber: string }

export function CodeLogin({ channels, onDone, compact, initialEmail = '' }: { channels: ('email' | 'sms')[]; onDone: (l: Verified) => void; compact?: boolean; initialEmail?: string }) {
  const [channel, setChannel] = useState<'email' | 'sms'>(channels[0] ?? 'email')
  const [target, setTarget] = useState(initialEmail)
  const [sentTo, setSentTo] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [wait, setWait] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!wait) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const sendCode = async () => {
    setBusy(true); setError('')
    const r = await sendCodeAction(channel, target)
    setBusy(false)
    if (!r.ok) return setError(r.error ?? 'تعذّر الإرسال')
    setSentTo(r.target!)
    setWait(60)
    /* بعد رسم الحقل */
    requestAnimationFrame(() => codeRef.current?.focus())
  }
  const verify = async (c = code) => {
    if (c.length !== 6) return
    setBusy(true); setError('')
    const r = await verifyCodeAction(channel, sentTo, c)
    setBusy(false)
    if (!r.ok) { setError(r.error ?? 'رمز غير صحيح'); setCode(''); return }
    onDone(r.learner!)
  }

  return (
    <div className={s.box} data-compact={compact ? '1' : '0'}>
      {!sentTo ? (
        <>
          {channels.length > 1 && (
            <div className={s.switch} role="tablist">
              <button role="tab" aria-selected={channel === 'email'} onClick={() => { setChannel('email'); setTarget('') }}>بالبريد</button>
              <button role="tab" aria-selected={channel === 'sms'} onClick={() => { setChannel('sms'); setTarget('') }}>بالجوال</button>
            </div>
          )}
          <label className={s.field}>
            <span>{channel === 'email' ? 'البريد الإلكتروني' : 'رقم الجوال'}</span>
            <input dir="ltr" className={s.input} type={channel === 'email' ? 'email' : 'tel'} autoComplete={channel === 'email' ? 'email' : 'tel'}
              placeholder={channel === 'email' ? 'name@example.com' : '05xxxxxxxx'} value={target}
              onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && target && sendCode()} />
          </label>
          {error && <p className={s.err} role="alert">{error}</p>}
          <button className="btn" disabled={busy || !target} onClick={sendCode}>{busy ? 'لحظة…' : 'أرسل رمز الدخول'}</button>
        </>
      ) : (
        <>
          <p className={s.sent}>أرسلنا رمزاً من 6 أرقام إلى <b dir="ltr">{sentTo}</b></p>
          <label className={s.field}>
            <span>رمز التحقق</span>
            <input ref={codeRef} className={`${s.input} ${s.code} num`} dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              value={code} aria-label="رمز التحقق"
              onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(v); if (v.length === 6) verify(v) }} />
          </label>
          {error && <p className={s.err} role="alert">{error}</p>}
          <button className="btn" disabled={busy || code.length !== 6} onClick={() => verify()}>{busy ? 'نتحقق…' : 'تحقّق وادخل'}</button>
          <div className={s.links}>
            <button disabled={wait > 0 || busy} onClick={sendCode}>{wait > 0 ? <>إعادة الإرسال بعد <span className="num">{wait}</span> ث</> : 'أعد إرسال الرمز'}</button>
            <button onClick={() => { setSentTo(''); setCode(''); setError('') }}>تغيير {channel === 'email' ? 'البريد' : 'الجوال'}</button>
          </div>
        </>
      )}
    </div>
  )
}
