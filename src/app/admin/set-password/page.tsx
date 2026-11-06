/* تعيين كلمة المرور من رابط دعوة أو إعادة تعيين — الرابط موقّع ومرتبط بنسخة الحساب فيسقط بعد استعماله */
import type { Metadata } from 'next'
import { brandView } from '@/server/brand'
import { linkTarget } from '@/server/staff-auth'
import { LogoMark } from '@/components/Logo'
import { SetPasswordForm } from './SetPasswordForm'
import styles from '../login/login.module.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'تعيين كلمة المرور', robots: { index: false, follow: false }, referrer: 'no-referrer' }

export default async function SetPassword({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t = '' } = await searchParams
  const [brand, target] = await Promise.all([brandView(), linkTarget(t)])
  return (
    <main id="main" className={styles.page}>
      <div className={styles.card}>
        <LogoMark pair={brand.academy} alt={brand.name} height={56} className={styles.mark} />
        <h1 className={styles.title}>{target?.purpose === 'invite' ? `مرحباً في فريق ${brand.name}` : 'كلمة مرور جديدة'}</h1>
        {target ? (
          <SetPasswordForm token={t} email={target.member.email ?? ''} />
        ) : (
          <div className={styles.form} role="alert">
            <p className={styles.sub}>الرابط منتهٍ أو استُخدم من قبل. اطلب رابطاً جديداً من مالك المنصة (الفريق ← رابط كلمة المرور).</p>
            <a className="btn ghost" href="/admin/login">صفحة الدخول</a>
          </div>
        )}
      </div>
    </main>
  )
}
