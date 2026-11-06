/* صفحة التهيئة: المالك موجود محلياً (db-setup)، فتعرض «استعادة حساب المالك» بكلمة مرور الإعداد:
   كلمة خاطئة تُرفض، والصحيحة تعيّن كلمة مرور جديدة يدخل بها المالك. (أخيراً: يغيّر كلمة مرور المالك) */
import { expect, test } from '@playwright/test'
import { ADMIN_EMAIL, ADMIN_PASSWORD, adminPage } from './helpers'

test('استعادة حساب المالك من صفحة التهيئة بكلمة مرور الإعداد', async ({ page, browser }) => {
  await page.goto('/setup')
  await expect(page.getByRole('heading', { name: 'تهيئة المنصة' })).toBeVisible()
  await expect(page.locator('li[data-ok="1"]', { hasText: 'المالك' })).toBeVisible()
  await page.click('summary:has-text("استعادة حساب المالك")')
  const form = page.locator('details form')
  await form.locator('input[name=setup-password]').fill('wrong-password')
  await form.locator('input[type=email]').fill(ADMIN_EMAIL)
  await form.locator('input[autocomplete=new-password]').nth(0).fill('a brand new owner phrase')
  await form.locator('input[autocomplete=new-password]').nth(1).fill('a brand new owner phrase')
  await form.locator('button.btn').click()
  await expect(form.locator('[role=alert][data-ok]')).toContainText('غير صحيحة')
  await form.locator('input[name=setup-password]').fill(ADMIN_PASSWORD)
  await form.locator('button.btn').click()
  await expect(form.locator('[role=status][data-ok]')).toContainText(ADMIN_EMAIL)
  /* القديمة لم تعد تعمل، والجديدة تعمل */
  const p = await (await browser.newContext()).newPage()
  await p.goto('/admin/login')
  await p.fill('input[name=email]', ADMIN_EMAIL)
  await p.fill('input[name=password]', ADMIN_PASSWORD)
  await p.click('button.btn')
  await expect(p.locator('form [role=alert]')).toContainText('غير صحيحة')
  const owner = await adminPage(browser, ADMIN_EMAIL, 'a brand new owner phrase')
  await expect(owner.getByRole('link', { name: 'الفريق والصلاحيات' })).toBeVisible()
})
