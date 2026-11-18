'use client'
/* «ملفي» — البيانات الإلزامية أولاً (شرط بدء الدورات، وتثبت بعد إكمالها)، ثم الاختيارية.
   القواعد على الخادم (saveProfileAction)؛ هنا عرضها: الحقل الثابت معطّل، والإقرار قبل التثبيت، والعودة إلى الدورة بعد الحفظ. */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { logoutAction, saveProfileAction } from '@/site/auth-actions'
import { IDENTITY_LABEL, type IdentityField } from '@/lib/identity'
import a from '@/site/auth/auth.module.css'
import st from './learn.module.css'

type Values = { name: string; nameEn: string; nationalId: string; phone: string; org: string; vatNumber: string }

export function ProfileForm({ initial, email, lock, gaps, next }: {
  initial: Values; email: string
  lock: { nationalId: boolean; names: boolean }
  gaps: IdentityField[]
  /** بعد الحفظ: العودة إلى الدورة التي طلبت البيانات */
  next: string | null
}) {
  const router = useRouter()
  const [v, setV] = useState(initial)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const f = (k: keyof Values, label: string, o: { ltr?: boolean; locked?: boolean; mode?: 'numeric' | 'tel' } = {}) => (
    <label className={a.field}>
      <span>{label}{o.locked && ' — مثبّت'}</span>
      <input className={a.input} dir={o.ltr ? 'ltr' : undefined} inputMode={o.mode} value={v[k]} disabled={o.locked} aria-required={k in IDENTITY_LABEL}
        autoComplete={k === 'nationalId' ? 'off' : undefined} onChange={(e) => { setV({ ...v, [k]: e.target.value }); setMsg(null) }} />
    </label>
  )
  return (
    <div className={st.profile}>
      <section className={st.form} aria-labelledby="id-h">
        <h2 id="id-h">البيانات الإلزامية</h2>
        <p>{lock.names
          ? 'بياناتك مكتملة ومثبّتة — حساب واحد لشخص واحد. لتصحيح الاسم أو رقم الهوية تواصل مع الأكاديمية.'
          : `شرط لبدء الدورات وتُطبع على شهادتك. بعد حفظها مكتملة لا يمكن تعديل الاسم ورقم الهوية إلا من الأكاديمية.${gaps.length ? ` ينقصك: ${gaps.map((g) => IDENTITY_LABEL[g]).join('، ')}.` : ''}`}</p>
        <label className={a.field}><span>البريد</span><input className={a.input} dir="ltr" value={email} disabled /></label>
        {f('name', 'الاسم الكامل بالعربية — كما في الهوية', { locked: lock.names })}
        {f('nameEn', 'الاسم الكامل بالإنجليزية — كما في الجواز أو الإقامة', { ltr: true, locked: lock.names })}
        {f('nationalId', 'رقم الهوية الوطنية أو الإقامة (10 أرقام)', { ltr: true, locked: lock.nationalId, mode: 'numeric' })}
        {f('phone', 'الجوال — للدخول برسالة نصية', { ltr: true, mode: 'tel' })}
        {!lock.names && (
          <label className={st.check}>
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
            <span>أقرّ أن هذه بياناتي الصحيحة وأن الحساب لي وحدي، وأعلم أن الاسم ورقم الهوية لا يُعدَّلان بعد الحفظ.</span>
          </label>
        )}
      </section>
      <section className={st.form} aria-labelledby="more-h">
        <h2 id="more-h">بيانات إضافية (اختيارية)</h2>
        {f('org', 'الجهة')}
        {f('vatNumber', 'الرقم الضريبي للمنشأة', { ltr: true })}
      </section>
      {msg && <p className={msg.ok ? '' : a.err} role="status">{msg.t}</p>}
      <div className={st.actions}>
        <button className="btn" disabled={busy} onClick={async () => {
          setBusy(true)
          const r = await saveProfileAction({ ...v, confirm })
          setBusy(false)
          if (r.ok && next) { location.assign(next); return }
          setMsg(r.ok ? { ok: true, t: 'حُفظ ملفك ✓' } : { ok: false, t: r.error ?? 'تعذّر الحفظ' })
          if (r.ok) router.refresh()
        }}>{next ? 'حفظ والعودة إلى الدورة' : 'حفظ'}</button>
        <form action={logoutAction.bind(null, true, '/')}><button className="btn ghost">الخروج من كل الأجهزة</button></form>
      </div>
    </div>
  )
}
