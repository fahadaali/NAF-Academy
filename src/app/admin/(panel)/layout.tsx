import type { Metadata } from 'next'
import { ViewTransition } from 'react'
import { MotionRoot } from '@/components/MotionRoot'
import { PermsProvider } from '@/admin/ui/perms'
import { requireAdmin } from '@/server/auth'
import { can, PERMS, ROLE_LABEL } from '@/lib/permissions'
import { Sidebar } from '@/admin/ui/Sidebar'
import { brandView } from '@/server/brand'
import styles from '@/admin/ui/panel.module.css'

export const metadata: Metadata = { title: 'لوحة الأكاديمية', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin()
  const perms = PERMS.filter((x) => can(admin.role, x, admin.perms))
  return (
    <div className={styles.shell}>
      <MotionRoot />
      {/* الشريط الجانبي ثابت أثناء التنقّل داخل اللوحة: React يسمّيه أثناء انتقاله وحده (فلا يدخل في حركة الجذر)،
          ودائرة تبديل الوضع لا تتأثر لأنها انتقال المتصفح لا انتقال React */}
      <ViewTransition name="admin-nav-swap" default="none">
        <Sidebar name={admin.name} role={ROLE_LABEL[admin.role]} perms={perms} brand={await brandView()} />
      </ViewTransition>
      <main id="main" className={styles.main}><PermsProvider perms={perms}><ViewTransition default="page-swap">{children}</ViewTransition></PermsProvider></main>
    </div>
  )
}
