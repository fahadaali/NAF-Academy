'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setupAction } from './actions'
import type { SetupResult } from '@/server/setup'
import st from './setup.module.css'

export function SetupForm({ needOwner, needSeed }: { needOwner: boolean; needSeed: boolean }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [seed, setSeed] = useState(needSeed)
  const [busy, setBusy] = useState(false)
  const [r, setR] = useState<SetupResult | null>(null)
  return (
    <form className={st.form} onSubmit={async (e) => {
      e.preventDefault()
      setBusy(true); setR(null)
      const res = await setupAction({ password, ownerEmail: needOwner ? ownerEmail : '', seed: needSeed && seed })
      setBusy(false); setR(res)
      if (res.ok) { setPassword(''); router.refresh() }
    }}>
      <label className={st.field}>
        <span>كلمة مرور الإعداد</span>
        <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <small>قيمة <code>ADMIN_PASSWORD</code> التي أضفتها في Cloudflare ← Variables and Secrets</small>
      </label>
      {needOwner && (
        <label className={st.field}>
          <span>بريدك — تصير مالك المنصة</span>
          <input type="email" dir="ltr" autoComplete="email" required value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="you@naflaw.sa" />
          <small>البريد نفسه الذي تدخل به عبر الدخول الموحّد لناف</small>
        </label>
      )}
      {needSeed && (
        <label className={st.check}>
          <input type="checkbox" checked={seed} onChange={(e) => setSeed(e.target.checked)} />
          <span>بذر المحتوى المبدئي (مسارات ودورات ومدربون تجريبيون تعدّلها أو تحذفها من اللوحة)</span>
        </label>
      )}
      <button className="btn" disabled={busy}>{busy ? 'تجري التهيئة… لا تغلق الصفحة' : needOwner || needSeed ? 'تهيئة المنصة' : 'تطبيق الترحيلات المعلّقة'}</button>
      {r && (
        <div className={st.result} role={r.ok ? 'status' : 'alert'} data-ok={r.ok ? '1' : '0'}>
          {r.steps.length > 0 && <ul role="list">{r.steps.map((x) => <li key={x}>{x}</li>)}</ul>}
          {r.error && <p>{r.error}</p>}
        </div>
      )}
    </form>
  )
}
