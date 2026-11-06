'use client'
import { useActionState, useEffect, useState } from 'react'
import { forgot, login, secondStep, type LoginState } from './actions'
import { LogoMark } from '@/components/Logo'
import { Glow } from '@/components/Glow'
import { pick } from '@/lib/brand'
import type { BrandView } from '@/lib/brand'
import styles from './login.module.css'

type View = LoginState['step']

export function LoginForm({ brand, initial = 'password', note }: { brand: BrandView; initial?: View; note?: string }) {
  const [view, setView] = useState<View>(initial)
  const [a, loginAct, p1] = useActionState(login, { step: 'password' })
  const [b, stepAct, p2] = useActionState(secondStep, { step: '2fa' })
  const [c, forgotAct, p3] = useActionState(forgot, { step: 'forgot' })
  useEffect(() => { if (a.step !== 'password') setView(a.step) }, [a])
  useEffect(() => { if (b.step === 'password') setView('password') }, [b])
  useEffect(() => { if (c.step === 'sent') setView('sent') }, [c])

  return (
    <main id="main" className={styles.page}>
      <div className={styles.card}>
        <Glow size="sm" height={56} shape={pick(brand.academy, 'light')?.url} className={styles.mark}>
          <LogoMark pair={brand.academy} alt={brand.name} height={56} />
        </Glow>
        <h1 className={styles.title}>لوحة {brand.name}</h1>

        {view === 'password' && (
          <form action={loginAct} className={styles.form}>
            <p className={styles.sub}>{note ?? 'ادخل ببريدك وكلمة مرورك.'}</p>
            {/* بعد محاولة خاطئة يعيد React ضبط الحقول — البريد يعود من حالة الإجراء فلا يُكتب من جديد */}
            <label className={styles.field}><span>البريد</span><input key={a.email ?? ''} name="email" type="email" dir="ltr" required autoComplete="username" autoFocus={!a.email} defaultValue={a.email} /></label>
            <label className={styles.field}><span>كلمة المرور</span><input name="password" type="password" required autoComplete="current-password" autoFocus={!!a.email} /></label>
            {(a.error || (b.step === 'password' && b.error)) && <p className={styles.error} role="alert">{a.error ?? b.error}</p>}
            <button className="btn" disabled={p1}>{p1 ? 'جارٍ الدخول…' : 'دخول'}</button>
            <button type="button" className={styles.link} onClick={() => setView('forgot')}>نسيت كلمة المرور؟</button>
          </form>
        )}

        {view === '2fa' && (
          <form action={stepAct} className={styles.form}>
            <p className={styles.sub}>افتح تطبيق المصادقة وأدخل الرمز ذا الأرقام الستة.</p>
            <label className={styles.field}>
              <span>رمز التحقق</span>
              <input name="code" inputMode="numeric" pattern="[0-9 ]{6,7}" maxLength={7} dir="ltr" required autoComplete="one-time-code" autoFocus className={styles.code} />
            </label>
            {b.error && <p className={styles.error} role="alert">{b.error}</p>}
            <button className="btn" disabled={p2}>{p2 ? 'جارٍ التحقق…' : 'تحقق'}</button>
            <p className={styles.hint}>فقدت جهازك؟ يلغي مالك المنصة التحقق الثنائي لحسابك من «الفريق»، والمالك من صفحة <a href="/setup">التهيئة</a>.</p>
          </form>
        )}

        {view === 'forgot' && (
          <form action={forgotAct} className={styles.form}>
            <p className={styles.sub}>أدخل بريدك ونرسل إليه رابط تعيين كلمة مرور جديدة.</p>
            <label className={styles.field}><span>البريد</span><input name="email" type="email" dir="ltr" required autoComplete="username" autoFocus /></label>
            {c.error && <p className={styles.error} role="alert">{c.error}</p>}
            <button className="btn" disabled={p3}>{p3 ? 'جارٍ الإرسال…' : 'أرسل الرابط'}</button>
            <button type="button" className={styles.link} onClick={() => setView('password')}>رجوع إلى الدخول</button>
          </form>
        )}

        {view === 'sent' && (
          <div className={styles.form} role="status">
            <p className={styles.sub}>
              {c.mail
                ? 'إن كان البريد لحساب في الفريق فسيصله رابط خلال دقائق، صالح ساعتين.'
                : 'البريد غير مربوط بالمنصة بعد، فلا تُرسل الروابط آلياً. اطلب من مالك المنصة رابط إعادة التعيين من «الفريق» — والمالك يعيّن كلمة مروره من صفحة التهيئة.'}
            </p>
            {!c.mail && <a className="btn ghost" href="/setup">صفحة التهيئة</a>}
            <button type="button" className={styles.link} onClick={() => setView('password')}>رجوع إلى الدخول</button>
          </div>
        )}
      </div>
    </main>
  )
}
