'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Emblem } from '@/components/Emblem'
import { logout } from '@/app/admin/login/actions'
import styles from './panel.module.css'

const groups = [
  { title: 'المحتوى', items: [
    { href: '/admin', label: 'نظرة عامة', icon: '◈' },
    { href: '/admin/courses', label: 'الدورات', icon: '▤' },
    { href: '/admin/tracks', label: 'المسارات', icon: '☰' },
    { href: '/admin/instructors', label: 'المدربون', icon: '◉' },
    { href: '/admin/media', label: 'مكتبة الصور', icon: '▣' },
  ] },
  { title: 'الموقع', items: [
    { href: '/admin/home', label: 'الصفحة الرئيسية', icon: '⌂' },
  ] },
  { title: 'السجلات', items: [
    { href: '/admin/trash', label: 'المحذوفات', icon: '⌫' },
    { href: '/admin/audit', label: 'سجل التعديلات', icon: '≡' },
  ] },
]

export function Sidebar({ name }: { name: string }) {
  const path = usePathname()
  const on = (href: string) => (href === '/admin' ? path === '/admin' : path.startsWith(href))
  return (
    <aside className={styles.side}>
      <Link href="/admin" className={styles.brand}>
        <Emblem size={34} />
        <span><strong>أكاديمية ناف</strong><small>لوحة الإدارة</small></span>
      </Link>
      <nav className={styles.nav} aria-label="اللوحة">
        {groups.map((g) => (
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
        <form action={logout}><button className={styles.out}>خروج · {name}</button></form>
      </div>
    </aside>
  )
}
