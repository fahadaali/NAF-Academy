'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { LogoMark } from '@/components/Logo'
import type { BrandView } from '@/lib/brand'
import { logout } from '@/app/admin/login/actions'
import type { Perm } from '@/lib/permissions'
import styles from './panel.module.css'

const groups: { title: string; items: { href: string; label: string; icon: string; perm: Perm }[] }[] = [
  { title: 'المحتوى', items: [
    { href: '/admin', label: 'نظرة عامة', icon: '◈', perm: 'content.read' },
    { href: '/admin/courses', label: 'الدورات', icon: '▤', perm: 'content.read' },
    { href: '/admin/tracks', label: 'المسارات', icon: '☰', perm: 'content.read' },
    { href: '/admin/instructors', label: 'المدربون', icon: '◉', perm: 'content.read' },
    { href: '/admin/media', label: 'مكتبة الصور', icon: '▣', perm: 'content.write' },
    { href: '/admin/learning', label: 'الواجبات والأسئلة', icon: '✎', perm: 'learning.review' },
    { href: '/admin/learning/sessions', label: 'الجلسات والحضور', icon: '⌖', perm: 'attendance.mark' },
    { href: '/admin/reviews', label: 'التقييمات', icon: '★', perm: 'content.write' },
    { href: '/admin/certificates', label: 'الشهادات', icon: '✪', perm: 'certificates.manage' },
    { href: '/admin/certificates/templates', label: 'قوالب الشهادات', icon: '▭', perm: 'certificates.manage' },
  ] },
  { title: 'المبيعات', items: [
    { href: '/admin/analytics', label: 'التحليلات', icon: '◮', perm: 'analytics.read' },
    { href: '/admin/sales', label: 'لوحة المبيعات', icon: '◔', perm: 'sales.read' },
    { href: '/admin/orders', label: 'الطلبات', icon: '▥', perm: 'sales.read' },
    { href: '/admin/coupons', label: 'الكوبونات', icon: '✦', perm: 'sales.coupons' },
    { href: '/admin/corporate', label: 'طلبات المؤسسات', icon: '▦', perm: 'corporate.manage' },
    { href: '/admin/organizations', label: 'حسابات المؤسسات', icon: '◫', perm: 'corporate.manage' },
    { href: '/admin/settings/payments', label: 'إعدادات الدفع', icon: '⚙', perm: 'payments.manage' },
  ] },
  { title: 'الموقع', items: [
    { href: '/admin/brand', label: 'الهوية والشعارات', icon: '◐', perm: 'site.write' },
    { href: '/admin/home', label: 'الصفحة الرئيسية', icon: '⌂', perm: 'site.write' },
    { href: '/admin/settings/channels', label: 'قنوات الرسائل', icon: '✉', perm: 'channels.manage' },
    { href: '/admin/notifications', label: 'الرسائل الآلية', icon: '◷', perm: 'notify.manage' },
    { href: '/admin/notifications/queue', label: 'طابور الرسائل', icon: '⋯', perm: 'notify.manage' },
    { href: '/admin/messages', label: 'سجل الرسائل', icon: '⇄', perm: 'messages.read' },
    { href: '/admin/team', label: 'الفريق والصلاحيات', icon: '◎', perm: 'team.manage' },
  ] },
  { title: 'السجلات', items: [
    { href: '/admin/trash', label: 'المحذوفات', icon: '⌫', perm: 'content.write' },
    { href: '/admin/audit', label: 'سجل التعديلات', icon: '≡', perm: 'audit.read' },
  ] },
]

export function Sidebar({ name, role, mode, perms, brand }: { name: string; role: string; mode: 'naf-auth' | 'password'; perms: Perm[]; brand: BrandView }) {
  const path = usePathname()
  const hit = (href: string) => (href === '/admin' ? path === '/admin' : path === href || path.startsWith(`${href}/`))
  /* أطول رابط مطابق هو النشط — فلا تُضاء «الواجبات» داخل «الجلسات» */
  const active = groups.flatMap((g) => g.items).filter((i) => hit(i.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href
  const on = (href: string) => href === active
  return (
    <aside className={styles.side}>
      <Link href="/admin" className={styles.brand}>
        <LogoMark pair={brand.academy} alt={brand.showName ? '' : brand.name} height={34} tone="dark" />
        <span>{(brand.showName || !(brand.academy.light || brand.academy.dark)) && <strong>{brand.name}</strong>}<small>لوحة الإدارة</small></span>
      </Link>
      <nav className={styles.nav} aria-label="اللوحة">
        {groups.map((g) => ({ ...g, items: g.items.filter((i) => perms.includes(i.perm)) })).filter((g) => g.items.length).map((g) => (
          <div key={g.title} className={styles.group}>
            <span className={styles.groupTitle}>{g.title}</span>
            {g.items.map((it) => (
              <Link key={it.href} href={it.href} aria-current={on(it.href) ? 'page' : undefined}>
                <span className={styles.icon} aria-hidden="true">{it.icon}</span>{it.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className={styles.foot}>
        <a href="/" target="_blank" rel="noreferrer" className={styles.view}>عرض الموقع ↗</a>
        <span className={styles.who}>{name} · {role}</span>
        {mode === 'naf-auth'
          ? <form action="/auth/logout" method="post"><button className={styles.out}>خروج</button></form>
          : <form action={logout}><button className={styles.out}>خروج</button></form>}
      </div>
    </aside>
  )
}
