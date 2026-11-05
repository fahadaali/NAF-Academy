/* تبديل الوضع بدائرة View Transition تنطلق من الزر نفسه. */
import { prefersCalm } from './tokens'

export type Theme = 'light' | 'dark'
export const THEME_KEY = 'naf-academy-theme'

export function currentTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'dark' || attr === 'light') return attr
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function apply(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    /* التخزين محجوب */
  }
  document.dispatchEvent(new CustomEvent('academy:theme', { detail: theme }))
}

export function switchTheme(next: Theme, origin?: HTMLElement) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } }
  if (!doc.startViewTransition || prefersCalm() || !origin) {
    apply(next)
    return
  }
  const r = origin.getBoundingClientRect()
  const root = document.documentElement
  root.style.setProperty('--vt-x', `${r.left + r.width / 2}px`)
  root.style.setProperty('--vt-y', `${r.top + r.height / 2}px`)
  root.classList.add('theme-vt')
  doc.startViewTransition(() => apply(next)).finished.finally(() => root.classList.remove('theme-vt'))
}
