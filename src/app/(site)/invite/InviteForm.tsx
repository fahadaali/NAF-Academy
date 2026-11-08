'use client'
import { useActionState } from 'react'
import { acceptAction, type AcceptState } from './actions'
import a from '@/site/auth/auth.module.css'
import v from './invite.module.css'

/** existing: للبريد حساب قائم — لا حقول (لا تُكتب بياناته من الرابط)، والقبول يحوّل إلى الدخول برمزه */
export function InviteForm({ token, email, name = '', phone = '', nameEn = '', org = '', existing = false }: { token: string; email: string; name?: string; phone?: string; nameEn?: string; org?: string; existing?: boolean }) {
  const [state, action, pending] = useActionState<AcceptState, FormData>(acceptAction, {})
  const err = (k: string) => state.fields?.[k]
  if (existing) {
    return (
      <form action={action} className={v.form} noValidate>
        <input type="hidden" name="t" value={token} />
        <label className={a.field}><span>البريد</span><input className={a.input} type="email" dir="ltr" value={email} readOnly autoComplete="email" /></label>
        {state.error && <p className={a.err} role="alert">{state.error}</p>}
        <button className="btn" disabled={pending}>{pending ? 'جارٍ التسجيل…' : 'قبول الدعوة'}</button>
      </form>
    )
  }
  return (
    <form action={action} className={v.form} noValidate>
      <input type="hidden" name="t" value={token} />
      <label className={a.field}><span>البريد</span><input className={a.input} type="email" dir="ltr" value={email} readOnly autoComplete="email" /></label>
      <label className={a.field}>
        <span>الاسم الكامل — كما يُكتب في الشهادة</span>
        <input className={a.input} name="name" defaultValue={name} required autoComplete="name" autoFocus aria-invalid={!!err('name')} />
        {err('name') && <span className={a.err}>{err('name')}</span>}
      </label>
      <label className={a.field}>
        <span>رقم الجوال</span>
        <input className={a.input} name="phone" type="tel" dir="ltr" inputMode="tel" defaultValue={phone} required autoComplete="tel" placeholder="05xxxxxxxx" aria-invalid={!!err('phone')} />
        {err('phone') && <span className={a.err}>{err('phone')}</span>}
      </label>
      <label className={a.field}>
        <span>الاسم بالإنجليزية (اختياري — للشهادة الثنائية)</span>
        <input className={a.input} name="nameEn" dir="ltr" defaultValue={nameEn} autoComplete="off" aria-invalid={!!err('nameEn')} />
        {err('nameEn') && <span className={a.err}>{err('nameEn')}</span>}
      </label>
      <label className={a.field}>
        <span>الجامعة أو الجهة (اختياري)</span>
        <input className={a.input} name="org" defaultValue={org} autoComplete="organization" />
      </label>
      {state.error && <p className={a.err} role="alert">{state.error}</p>}
      <button className="btn" disabled={pending}>{pending ? 'جارٍ التسجيل…' : 'قبول الدعوة والدخول'}</button>
    </form>
  )
}
