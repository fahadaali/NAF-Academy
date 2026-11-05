'use client'
import { useState } from 'react'
import { logoutAction, saveProfileAction } from '@/site/auth-actions'
import a from '@/site/auth/auth.module.css'
import st from './learn.module.css'

export function ProfileForm({ initial, email }: { initial: { name: string; phone: string; org: string; vatNumber: string }; email: string }) {
  const [v, setV] = useState(initial)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const f = (k: keyof typeof v, label: string, ltr = false) => (
    <label className={a.field}><span>{label}</span><input className={a.input} dir={ltr ? 'ltr' : undefined} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>
  )
  return (
    <div className={st.form}>
      <label className={a.field}><span>البريد</span><input className={a.input} dir="ltr" value={email} disabled /></label>
      {f('name', 'الاسم الكامل')}
      {f('phone', 'الجوال — للدخول برسالة نصية', true)}
      {f('org', 'الجهة')}
      {f('vatNumber', 'الرقم الضريبي للمنشأة', true)}
      {msg && <p className={msg.ok ? '' : a.err} role="status">{msg.t}</p>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn" onClick={async () => { const r = await saveProfileAction(v); setMsg(r.ok ? { ok: true, t: 'حُفظ ملفك ✓' } : { ok: false, t: r.error ?? 'تعذّر الحفظ' }) }}>حفظ</button>
        <form action={logoutAction.bind(null, true, '/')}><button className="btn ghost">الخروج من كل الأجهزة</button></form>
      </div>
    </div>
  )
}
