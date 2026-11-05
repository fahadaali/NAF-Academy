'use client'
import { usePathname } from 'next/navigation'
import { logoutAction } from '@/site/auth-actions'
import s from './learn.module.css'

const items = [{ href: '/learn', label: 'دوراتي' }, { href: '/learn/certificates', label: 'شهاداتي' }, { href: '/learn/orders', label: 'طلباتي وفواتيري' }, { href: '/learn/profile', label: 'ملفي' }]

export function LearnNav({ org = false }: { org?: boolean }) {
  const path = usePathname()
  const list = org ? [...items.slice(0, 1), { href: '/learn/org', label: 'مؤسستي' }, ...items.slice(1)] : items
  return (
    <nav className={s.nav} aria-label="حسابي">
      {list.map((i) => <a key={i.href} href={i.href} aria-current={path === i.href ? 'page' : undefined}>{i.label}</a>)}
      <form action={logoutAction.bind(null, false, '/')}><button>خروج</button></form>
    </nav>
  )
}
