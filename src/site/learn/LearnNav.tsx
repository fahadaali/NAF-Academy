'use client'
import { usePathname } from 'next/navigation'
import { logoutAction } from '@/site/auth-actions'
import s from './learn.module.css'

const items = [{ href: '/learn', label: 'دوراتي' }, { href: '/learn/certificates', label: 'شهاداتي' }, { href: '/learn/orders', label: 'طلباتي وفواتيري' }, { href: '/learn/profile', label: 'ملفي' }]

export function LearnNav({ org = false, unread = 0 }: { org?: boolean; unread?: number }) {
  const path = usePathname()
  const list = org ? [...items.slice(0, 1), { href: '/learn/org', label: 'مؤسستي' }, ...items.slice(1)] : items
  return (
    <nav className={s.nav} aria-label="حسابي">
      {list.map((i) => <a key={i.href} href={i.href} aria-current={path === i.href ? 'page' : undefined}>{i.label}</a>)}
      <a href="/learn/inbox" aria-current={path === '/learn/inbox' ? 'page' : undefined} className={s.bell} aria-label={unread ? `الإشعارات — ${unread} غير مقروءة` : 'الإشعارات'}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
        الإشعارات{unread > 0 && <span className={`${s.dot} num`}>{unread > 99 ? '99+' : unread}</span>}
      </a>
      <form action={logoutAction.bind(null, false, '/')}><button>خروج</button></form>
    </nav>
  )
}
