'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ownerAction, setupAction } from './actions'
import type { SetupResult } from '@/server/setup'
import st from './setup.module.css'

function Result({ r }: { r: SetupResult | null }) {
  if (!r) return null
  return (
    <div className={st.result} role={r.ok ? 'status' : 'alert'} data-ok={r.ok ? '1' : '0'}>
      {r.steps.length > 0 && <ul role="list">{r.steps.map((x) => <li key={x}>{x}</li>)}</ul>}
      {r.error && <p>{r.error}</p>}
    </div>
  )
}

const SetupPassword = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <label className={st.field}>
    <span>كلمة مرور الإعداد</span>
    <input type="password" name="setup-password" autoComplete="off" required value={value} onChange={(e) => onChange(e.target.value)} />
    <small>قيمة <code>ADMIN_PASSWORD</code> التي أضفتها في Cloudflare ← Variables and Secrets (14 حرفاً على الأقل)</small>
  </label>
)

export function SetupForm({ needOwner, needSeed }: { needOwner: boolean; needSeed: boolean }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [ownerPassword, setOwnerPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [seed, setSeed] = useState(needSeed)
  const [busy, setBusy] = useState(false)
  const [r, setR] = useState<SetupResult | null>(null)
  return (
    <form className={st.form} onSubmit={async (e) => {
      e.preventDefault()
      if (needOwner && ownerPassword !== confirm) { setR({ ok: false, steps: [], error: 'كلمتا المرور غير متطابقتين' }); return }
      setBusy(true); setR(null)
      const res = await setupAction({ password, ownerEmail: needOwner ? ownerEmail : '', ownerPassword: needOwner ? ownerPassword : '', seed: needSeed && seed })
      setBusy(false); setR(res)
      if (res.ok) { setPassword(''); setOwnerPassword(''); setConfirm(''); router.refresh() }
    }}>
      <SetupPassword value={password} onChange={setPassword} />
      {needOwner && (
        <>
          <label className={st.field}>
            <span>بريدك — تصير مالك المنصة</span>
            <input type="email" dir="ltr" autoComplete="username" required value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="you@naflaw.sa" />
            <small>تدخل به إلى اللوحة من <code dir="ltr">/admin/login</code></small>
          </label>
          <label className={st.field}>
            <span>كلمة مرور حسابك</span>
            <input type="password" autoComplete="new-password" required minLength={10} value={ownerPassword} onChange={(e) => setOwnerPassword(e.target.value)} />
            <small>10 أحرف على الأقل، وغير كلمة مرور الإعداد</small>
          </label>
          <label className={st.field}>
            <span>تأكيدها</span>
            <input type="password" autoComplete="new-password" required minLength={10} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
        </>
      )}
      {needSeed && (
        <label className={st.check}>
          <input type="checkbox" checked={seed} onChange={(e) => setSeed(e.target.checked)} />
          <span>بذر المحتوى المبدئي (مسارات ودورات ومدربون تجريبيون تعدّلها أو تحذفها من اللوحة)</span>
        </label>
      )}
      <button className="btn" disabled={busy}>{busy ? 'تجري التهيئة… لا تغلق الصفحة' : needOwner || needSeed ? 'تهيئة المنصة' : 'تطبيق الترحيلات المعلّقة'}</button>
      <Result r={r} />
    </form>
  )
}

/** تعيين كلمة مرور المالك أو استعادة حسابه — بكلمة مرور الإعداد */
export function OwnerForm({ open }: { open: boolean }) {
  const router = useRouter()
  const [v, setV] = useState({ password: '', email: '', newPassword: '', confirm: '', clearTwoStep: false })
  const [busy, setBusy] = useState(false)
  const [r, setR] = useState<SetupResult | null>(null)
  return (
    <details className={st.owner} open={open}>
      <summary>{open ? 'عيّن كلمة مرور المالك' : 'استعادة حساب المالك (نسيت كلمة المرور أو فقدت جهاز التحقق)'}</summary>
      <form className={st.form} onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setR(null)
        const res = await ownerAction(v)
        setBusy(false); setR(res)
        if (res.ok) { setV({ password: '', email: '', newPassword: '', confirm: '', clearTwoStep: false }); router.refresh() }
      }}>
        <SetupPassword value={v.password} onChange={(password) => setV({ ...v, password })} />
        <label className={st.field}>
          <span>بريد المالك</span>
          <input type="email" dir="ltr" autoComplete="username" required value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
        </label>
        <label className={st.field}>
          <span>كلمة المرور الجديدة</span>
          <input type="password" autoComplete="new-password" required minLength={10} value={v.newPassword} onChange={(e) => setV({ ...v, newPassword: e.target.value })} />
          <small>10 أحرف على الأقل — تُخرج الحساب من كل الأجهزة</small>
        </label>
        <label className={st.field}>
          <span>تأكيدها</span>
          <input type="password" autoComplete="new-password" required minLength={10} value={v.confirm} onChange={(e) => setV({ ...v, confirm: e.target.value })} />
        </label>
        <label className={st.check}>
          <input type="checkbox" checked={v.clearTwoStep} onChange={(e) => setV({ ...v, clearTwoStep: e.target.checked })} />
          <span>إلغاء التحقق الثنائي أيضاً (إن فقدت جهاز المصادقة)</span>
        </label>
        <button className="btn" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ كلمة المرور'}</button>
        <Result r={r} />
      </form>
    </details>
  )
}
