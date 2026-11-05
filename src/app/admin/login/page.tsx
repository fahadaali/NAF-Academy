'use client'
import { useActionState } from 'react'
import { login } from './actions'
import { Emblem } from '@/components/Emblem'
import styles from './login.module.css'

export default function Login() {
  const [state, action, pending] = useActionState(login, {})
  return (
    <main id="main" className={styles.page}>
      <form action={action} className={styles.card}>
        <Emblem size={56} className={styles.mark} />
        <h1 className={styles.title}>لوحة الأكاديمية</h1>
        <p className={styles.sub}>ادخل لإدارة المسارات والدورات والمحتوى.</p>
        <label className={styles.field}><span>الاسم</span><input name="name" autoComplete="name" placeholder="اسمك في سجل التعديلات" /></label>
        <label className={styles.field}><span>كلمة المرور</span><input name="password" type="password" required autoComplete="current-password" autoFocus /></label>
        {state?.error && <p className={styles.error} role="alert">{state.error}</p>}
        <button className="btn" disabled={pending}>{pending ? 'جارٍ الدخول…' : 'دخول'}</button>
      </form>
    </main>
  )
}
