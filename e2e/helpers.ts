import { expect, type Browser, type Page } from '@playwright/test'

export const ADMIN_PASSWORD = 'e2e-setup-pass-1234567'
/** المالك التجريبي الذي ينشئه db-setup محلياً (ADMIN_EMAIL الافتراضي) */
export const ADMIN_EMAIL = 'admin@academy.local'

/** دخول الفريق ببريد المالك التجريبي وكلمة مروره */
export async function adminPage(browser: Browser, email = ADMIN_EMAIL, password = ADMIN_PASSWORD): Promise<Page> {
  const p = await (await browser.newContext()).newPage()
  p.on('dialog', (d) => d.accept())
  await p.goto('/admin/login')
  await p.fill('input[name=email]', email)
  await p.fill('input[name=password]', password)
  await p.click('button:has-text("دخول")')
  await p.waitForURL(/\/admin$/)
  return p
}

/** يفتح القنوات (البريد في صندوق تجريبي) والدفع (البوابة التجريبية) — مرة لكل تشغيل */
export async function openChannelsAndPayments(admin: Page) {
  await admin.goto('/admin/settings/channels')
  /* البريد وحده يكفي للدخول بالرمز (صندوق تجريبي في التطوير) */
  const email = admin.locator('button[role=switch]').first()
  if ((await email.getAttribute('aria-checked')) !== 'true') await email.click()
  await admin.click('button.btn:has-text("حفظ")')
  await admin.waitForTimeout(700)
  await admin.goto('/admin/settings/payments')
  const locked = admin.locator('button[role=switch]:has-text("مقفل")')
  if (await locked.count()) { await locked.click(); await admin.click('button.btn:has-text("حفظ")'); await admin.waitForTimeout(900) }
}

/** آخر رمز دخول وصل بريداً إلى الصندوق التجريبي */
export async function lastCode(admin: Page, to: string) {
  await admin.goto('/admin/messages')
  const row = admin.locator('tr', { hasText: to }).first()
  await expect(row).toBeVisible()
  const m = (await row.textContent())?.match(/\b(\d{6})\b/)
  if (!m) throw new Error(`لا رمز لـ ${to}`)
  return m[1]
}

/** تحقق المتدرب في صفحة الدفع برمز من الصندوق */
export async function verifyAt(page: Page, admin: Page, email: string, name: string, phone: string) {
  await page.fill('input[type=email]', email)
  await page.click('button:has-text("أرسل رمز الدخول")')
  await page.waitForTimeout(800)
  await page.fill('input[autocomplete=one-time-code]', await lastCode(admin, email))
  await expect(page.locator('text=تم التحقق')).toBeVisible()
  await page.fill('label:has-text("الاسم الكامل") input', name)
  await page.fill('label:has-text("الجوال") input', phone)
}

/** ما يخرج عن الشاشة على الجوال (يُقيَّم في الصفحة):
    - عنصر خارج حدود الشاشة وليس داخل حاوية تمرّر أو تقصّ — html يقصّ الأفقي فلا يمكن الوصول إليه؛
    - عنصر أعرض من حاوية تقصّ فائضها (hidden/clip) فيُقطع داخلها — كبطاقة اتسع عمودها لأعرض ما فيها. */
export const overflow = () => {
  const vw = document.documentElement.clientWidth
  const bad: string[] = []
  const name = (el: Element) => `${el.tagName}.${String(el.className).slice(0, 30)}`
  for (const el of document.querySelectorAll('main *')) {
    const cs = getComputedStyle(el)
    if (cs.position === 'fixed' || cs.display === 'none') continue
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) continue
    let sc = el.parentElement, inside = false
    while (sc && sc !== document.body) { if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(sc).overflowX)) { inside = true; break } sc = sc.parentElement }
    if (!inside && (r.right > vw + 1 || r.left < -1)) bad.push(name(el))
    if (inside && sc && cs.position !== 'absolute' && !el.closest('[aria-hidden=true], .sr-only, svg')) {
      const o = getComputedStyle(sc).overflowX
      const c = sc.getBoundingClientRect()
      if ((o === 'hidden' || o === 'clip') && r.width > c.width + 2 && (r.right > c.right + 2 || r.left < c.left - 2)) bad.push(`مقصوص ${name(el)}`)
    }
  }
  return { scroll: document.documentElement.scrollWidth - vw, bad: [...new Set(bad)].slice(0, 5) }
}
