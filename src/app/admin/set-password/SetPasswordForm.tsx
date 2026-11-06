'use client'
import { useActionState } from 'react'
import { setPassword } from './actions'
import styles from '../login/login.module.css'

export function SetPasswordForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState(setPassword, {})
  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="t" value={token} />
      <label className={styles.field}><span>البريد</span><input name="email" type="email" dir="ltr" value={email} readOnly autoComplete="username" /></label>
      <label className={styles.field}><span>كلمة المرور الجديدة</span><input name="password" type="password" required minLength={10} autoComplete="new-password" autoFocus /></label>
      <label className={styles.field}><span>تأكيدها</span><input name="confirm" type="password" required minLength={10} autoComplete="new-password" /></label>
      <p className={styles.hint}>10 أحرف على الأقل. جملة قصيرة تتذكرها أقوى من كلمة معقّدة.</p>
      {state.error && <p className={styles.error} role="alert">{state.error}</p>}
      <button className="btn" disabled={pending}>{pending ? 'جارٍ الحفظ…' : 'حفظ والدخول'}</button>
    </form>
  )
}
