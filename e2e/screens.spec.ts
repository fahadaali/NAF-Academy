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

/* اللمسة المتوهجة: هالتها وحبّاتها (في أبعد مواضعها، أول الحركة) داخل الشاشة — لا تُقصّ عند الحواف —
   وهالة التذييل لا تعبر الفاصل فوق الشعار */
const glowFits = () => {
  const vw = document.documentElement.clientWidth
  const bad: string[] = []
  for (const a of document.getAnimations()) {
    const el = (a.effect as KeyframeEffect | null)?.target as Element | null
    if (el?.closest('[data-glow]')) { a.pause(); a.currentTime = 0 }
  }
  for (const g of document.querySelectorAll<HTMLElement>('[data-glow]')) {
    if (!g.offsetParent && getComputedStyle(g).position !== 'fixed') continue
    const layers = [...g.querySelectorAll<HTMLElement>('[class*="halo"], [class*="grains"] > i')]
    for (const l of layers) {
      const r = l.getBoundingClientRect()
      if (!r.width) continue
      if (r.left < -1 || r.right > vw + 1) bad.push(`${g.dataset.glow}:${String(l.className).slice(0, 24)} ${Math.round(r.left)}..${Math.round(r.right)}/${vw}`)
    }
    const line = g.closest('footer')?.querySelector('[class*="cta"]')
    const halo = g.querySelector('[class*="halo"]')
    if (line && halo && halo.getBoundingClientRect().top < line.getBoundingClientRect().bottom - 1) bad.push('footer halo crosses divider')
  }
  return [...new Set(bad)].slice(0, 6)
}

for (const width of [360, 390, 1366]) {
  test(`اللمسة المتوهجة داخل الشاشة على ${width}px — التذييل وصفحة الدخول`, async ({ browser }) => {
    const p = await (await browser.newContext({ viewport: { width, height: 800 } })).newPage()
    await p.goto('/courses')
    await p.waitForLoadState('networkidle')
    await p.evaluate(() => scrollTo(0, document.body.scrollHeight))
    await p.waitForTimeout(600)
    expect(await p.evaluate(glowFits)).toEqual([])
    await p.goto('/admin/login')
    await p.waitForLoadState('networkidle')
    expect(await p.evaluate(glowFits)).toEqual([])
  })
}

test('صفحات البطاقة المفردة متمركزة على الجوال — الدخول وتعيين كلمة المرور والتهيئة وقبول الدعوة', async ({ browser }) => {
  for (const width of [360, 390]) {
    const p = await (await browser.newContext({ viewport: { width, height: 760 } })).newPage()
    for (const path of ['/admin/login', '/admin/set-password?t=invalid', '/setup', '/invite?t=invalid']) {
      const res = await p.goto(path)
      expect(res?.status(), path).toBe(200)
      const gaps = await p.evaluate(() => {
        const card = document.querySelector('main')!.firstElementChild as HTMLElement
        const r = card.getBoundingClientRect()
        return { left: Math.round(r.left), right: Math.round(document.documentElement.clientWidth - r.right) }
      })
      expect(Math.abs(gaps.left - gaps.right), `${path} @${width} ${JSON.stringify(gaps)}`).toBeLessThanOrEqual(2)
      expect(gaps.left, path).toBeGreaterThanOrEqual(8)
    }
  }
})

test('قائمة الجوال: فيها الدخول، وتتمرّر وحدها والصفحة خلفها ثابتة', async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 360 })
  await page.goto('/')
  const burger = page.getByRole('button', { name: 'القائمة' })
  await burger.click()
  const menu = page.getByRole('navigation', { name: 'الأقسام' })
  await expect(menu).toBeVisible()
  await page.mouse.move(370, 250)
  await page.mouse.wheel(0, 2000)
  await expect.poll(() => menu.evaluate((n) => n.scrollTop)).toBeGreaterThan(0)
  expect(await page.evaluate(() => scrollY)).toBe(0)
  await menu.getByRole('link', { name: 'دخول' }).click()
  await expect(page).toHaveURL(/\/login$/)
})
