import type { Metadata } from 'next'
import { requireAdmin } from '@/server/auth'
import { can, PERMS, ROLE_LABEL } from '@/lib/permissions'
import { Sidebar } from '@/admin/ui/Sidebar'
import { brandView } from '@/server/brand'
import styles from '@/admin/ui/panel.module.css'

export const metadata: Metadata = { title: 'لوحة الأكاديمية', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin()
  return (
    <div className={styles.shell}>
      <Sidebar name={admin.name} role={ROLE_LABEL[admin.role]} mode={admin.mode} perms={PERMS.filter((x) => can(admin.role, x, admin.perms))} brand={await brandView()} />
      <main id="main" className={styles.main}>{children}</main>
    </div>
  )
}
