/* الشاشات والحركة: المحتوى ظاهر بلا JS، ولا تمرير أفقي ولا عنصر خارج الشاشة على الجوال، والوضع يثبت قبل حزمة التطبيق */
import { expect, test } from '@playwright/test'
import { adminPage } from './helpers'

test('الرئيسية بلا JS: العنوان والدعوة ودرجات السلّم كلها ظاهرة', async ({ browser }) => {
  const p = await (await browser.newContext({ javaScriptEnabled: false })).newPage()
  await p.goto('/')
  await expect(p.locator('h1').first()).toBeVisible()
  const op = await p.evaluate(() => ({
    final: [...document.querySelectorAll('[class*="final"]')].map((e) => getComputedStyle(e).opacity),
    panels: [...document.querySelectorAll('[class*="panel"][data-state]')].map((e) => getComputedStyle(e).opacity),
  }))
  expect(op.final.every((x) => x === '1')).toBe(true)
  expect(op.panels.length).toBeGreaterThan(0)
  expect(op.panels.every((x) => x === '1')).toBe(true)
})

test('الوضع المختار يثبت قبل حزمة التطبيق', async ({ browser }) => {
  const ctx = await browser.newContext()
  await ctx.addInitScript(() => { try { localStorage.setItem('naf-academy-theme', 'dark') } catch { /* */ } })
  const p = await ctx.newPage()
  await p.route(/\/_next\/static\/.*\.js/, (r) => r.abort())
  await p.goto('/courses', { waitUntil: 'domcontentloaded' })
  expect(await p.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('dark')
})

const overflow = () => {
  const vw = document.documentElement.clientWidth
  const bad: string[] = []
  for (const el of document.querySelectorAll('main *')) {
    const cs = getComputedStyle(el)
    if (cs.position === 'fixed' || cs.display === 'none') continue
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) continue
    let sc = el.parentElement, inside = false
    while (sc && sc !== document.body) { if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(sc).overflowX)) { inside = true; break } sc = sc.parentElement }
    if (!inside && (r.right > vw + 1 || r.left < -1)) bad.push(`${el.tagName}.${String(el.className).slice(0, 30)}`)
  }
  return { scroll: document.documentElement.scrollWidth - vw, bad: [...new Set(bad)].slice(0, 5) }
}

test('لا شيء خارج الشاشة على 360px — الصفحات العامة', async ({ browser }) => {
  const p = await (await browser.newContext({ viewport: { width: 360, height: 760 } })).newPage()
  for (const path of ['/', '/courses', '/courses/evidence-system-deep-dive', '/courses/evidence-system-deep-dive/enroll', '/tracks', '/policies']) {
    await p.goto(path)
    await p.waitForLoadState('networkidle')
    expect(await p.evaluate(overflow), path).toEqual({ scroll: 0, bad: [] })
  }
})

test('لا شيء خارج الشاشة على 390px — اللوحة', async ({ browser }) => {
  const a = await adminPage(browser)
  await a.setViewportSize({ width: 390, height: 800 })
  for (const path of ['/admin', '/admin/courses', '/admin/learning/sessions', '/admin/messages', '/admin/team', '/admin/orders']) {
    await a.goto(path)
    await a.waitForLoadState('networkidle')
    expect(await a.evaluate(overflow), path).toEqual({ scroll: 0, bad: [] })
  }
})
