/* حسابات الفريق المستقلة: دعوة برابط ← تعيين كلمة المرور ← الدخول بدوره ← التحقق الثنائي ← الدخول بالرمز.
   (zy: قبل zz-setup الذي يغيّر كلمة مرور المالك) */
import { expect, test } from '@playwright/test'
import { adminPage } from './helpers'
import { fromBase32, stepOf, totpAt } from '../src/lib/staff-crypto'

const EMAIL = 'editor@naflaw.sa'
const PASS = 'editor long phrase 2026'

test('دعوة عضو برابط، وتعيين كلمة مروره، ودوره يحصر ما يراه، وتحققه الثنائي', async ({ browser }) => {
  const owner = await adminPage(browser)
  await owner.goto('/admin/team')
  await owner.fill('input[type=email]', EMAIL)
  await owner.locator('select').first().selectOption('content')
  await owner.click('button.btn:text-is("دعوة")')
  const link = await owner.locator('input[aria-label="الرابط"]').inputValue()
  expect(link).toContain('/admin/set-password?t=')

  /* العضو يفتح الرابط في متصفحه */
  const m = await (await browser.newContext()).newPage()
  await m.goto(new URL(link).pathname + new URL(link).search)
  await expect(m.locator('input[name=email]')).toHaveValue(EMAIL)
  await m.fill('input[name=password]', PASS)
  await m.fill('input[name=confirm]', `${PASS}!`)
  await m.click('button.btn')
  await expect(m.locator('form [role=alert]')).toContainText('غير متطابقتين')
  await m.fill('input[name=password]', PASS)
  await m.fill('input[name=confirm]', PASS)
  await m.click('button.btn')
  await m.waitForURL(/\/admin$/)
  /* دور المحتوى: لا «الفريق» ولا «إعدادات الدفع» في الشريط */
  await expect(m.getByRole('link', { name: 'الدورات' })).toBeVisible()
  await expect(m.getByRole('link', { name: 'الفريق والصلاحيات' })).toHaveCount(0)

  /* الرابط لا يصلح مرتين */
  const again = await (await browser.newContext()).newPage()
  await again.goto(new URL(link).pathname + new URL(link).search)
  await expect(again.locator('main [role=alert]')).toContainText('منتهٍ أو استُخدم')

  /* التحقق الثنائي من «حسابي» */
  await m.goto('/admin/account')
  await m.click('button:has-text("تفعيل التحقق الثنائي")')
  const secret = (await m.locator('code').first().textContent())!.replace(/\s/g, '')
  expect(fromBase32(secret).length).toBe(20)
  await m.fill('input[autocomplete=one-time-code]', await totpAt(secret, stepOf(Date.now())))
  await m.click('button.btn:text-is("تفعيل")')
  await expect(m.locator('text=فُعّل التحقق الثنائي')).toBeVisible()

  /* دخول جديد: كلمة المرور ثم الرمز (الخطوة التالية — الحالية استُعملت) */
  const fresh = await (await browser.newContext()).newPage()
  await fresh.goto('/admin/login')
  await fresh.fill('input[name=email]', EMAIL)
  await fresh.fill('input[name=password]', 'wrong password here')
  await fresh.click('button.btn')
  await expect(fresh.locator('form [role=alert]')).toContainText('غير صحيحة')
  await fresh.fill('input[name=password]', PASS)
  await fresh.click('button.btn')
  await expect(fresh.locator('input[name=code]')).toBeVisible()
  await fresh.fill('input[name=code]', '000000')
  await fresh.click('button.btn')
  await expect(fresh.locator('form [role=alert]')).toContainText('رمز غير صحيح')
  await fresh.fill('input[name=code]', await totpAt(secret, stepOf(Date.now()) + 1))
  await fresh.click('button.btn')
  await fresh.waitForURL(/\/admin$/)

  /* المالك يوقفه: تسقط جلسته فوراً */
  await owner.goto('/admin/team')
  await owner.locator('tr', { hasText: EMAIL }).getByRole('button', { name: 'إيقاف' }).click()
  await owner.waitForTimeout(600)
  await fresh.goto('/admin/courses')
  await fresh.waitForURL(/\/admin\/login/)
})
