'use client'
/* الشريط العلوي: زجاجي عند التمرير، يختفي نزولاً ويعود صعوداً، مع مؤشّر تقدّم القراءة
   والقسم الحالي، ومبدّل الوضع بالدائرة. */
import { useEffect, useRef, useState } from 'react'
import { subscribe } from '@/motion/scroll-bus'
import { currentTheme, switchTheme, type Theme } from '@/motion/theme'
import { Wordmark } from './Logo'
import type { BrandView } from '@/lib/brand'
import styles from './Header.module.css'

type Item = { href: string; label: string }

export function Header({ nav, brand }: { nav: Item[]; brand: BrandView }) {
  const bar = useRef<HTMLDivElement>(null)
  const head = useRef<HTMLElement>(null)
  const [active, setActive] = useState<string>('')
  const [theme, setTheme] = useState<Theme>('light')
  const [open, setOpen] = useState(false)
  /* اسم العرض فقط من كوكي غير حسّاس — فتبقى الصفحات العامة ثابتة سريعة */
  const [account, setAccount] = useState<string | null>(null)
  useEffect(() => {
    const m = document.cookie.match(/(?:^|; )naf_hi=([^;]*)/)
    if (m) setAccount(decodeURIComponent(m[1]))
  }, [])

  useEffect(() => {
    setTheme(currentTheme())
    const onTheme = (e: Event) => setTheme((e as CustomEvent<Theme>).detail)
    document.addEventListener('academy:theme', onTheme)

    let lastY = 0
    let night = false
    const nights = Array.from(document.querySelectorAll<HTMLElement>('[data-surface="night"]'))
    const off = subscribe({
      read: () => {
        const mid = (head.current?.offsetHeight ?? 68) / 2
        night = nights.some((n) => {
          const r = n.getBoundingClientRect()
          return r.top <= mid && r.bottom >= mid
        })
      },
      write: ({ y, max }) => {
        bar.current?.style.setProperty('--p', String(y / max))
        const h = head.current
        if (!h) return
        h.dataset.solid = y > 24 ? '1' : '0'
        h.dataset.night = night ? '1' : '0'
        const down = y > lastY && y > 320
        h.dataset.hidden = down ? '1' : '0'
        lastY = y
      },
    })

    const ids = nav.map((n) => n.href.split('#')[1]).filter(Boolean)
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: '-45% 0px -50% 0px' },
    )
    ids.forEach((id) => {
      const el = document.getElementById(id)
      if (el) io.observe(el)
    })
    return () => {
      off()
      io.disconnect()
      document.removeEventListener('academy:theme', onTheme)
    }
  }, [nav])

  return (
    <header ref={head} className={styles.header} data-vt="site-header" data-open={open ? '1' : '0'}>
      <div className={`wrap ${styles.inner}`}>
        <a href="/" className={styles.brand} aria-label={`${brand.name} — الرئيسية`}>
          <Wordmark brand={brand} />
        </a>
        <nav className={styles.nav} aria-label="الأقسام">
          <ol role="list">
            {nav.map((n, i) => (
              <li key={n.href}>
                <a href={n.href} aria-current={active && active === n.href.split('#')[1] ? 'true' : undefined} onClick={() => setOpen(false)}>
                  <span className={`${styles.idx} num`}>{String(i + 1).padStart(2, '0')}</span>
                  {n.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className={styles.actions}>
          <button
            className={styles.theme}
            data-state={theme}
            aria-label={theme === 'dark' ? 'المظهر الفاتح' : 'المظهر الداكن'}
            onClick={(e) => switchTheme(theme === 'dark' ? 'light' : 'dark', e.currentTarget)}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <circle className={styles.sun} cx="12" cy="12" r="5" />
              <g className={styles.rays}>
                {Array.from({ length: 8 }, (_, i) => (
                  <line key={i} x1="12" y1="2.5" x2="12" y2="4.5" transform={`rotate(${i * 45} 12 12)`} />
                ))}
              </g>
              <circle className={styles.bite} cx="16.5" cy="8" r="4.6" />
            </svg>
          </button>
          <a href={account ? '/learn' : '/login'} className={styles.login}>{account ? 'حسابي' : 'دخول'}</a>
          <a href="/courses" className={`btn ${styles.cta}`}>سجّل الآن</a>
          <button className={styles.burger} aria-label="القائمة" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <span /><span />
          </button>
        </div>
      </div>
      <div ref={bar} className={styles.progress} aria-hidden="true" />
    </header>
  )
}
