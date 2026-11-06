/* صفحة التهيئة: كلمة خاطئة تُرفض، والصحيحة تنشئ المالك مرة واحدة. (محلياً: الترحيلات من db-setup) */
import { expect, test } from '@playwright/test'
import { ADMIN_PASSWORD } from './helpers'

test('التهيئة من المتصفح بكلمة مرور الإعداد', async ({ page }) => {
  await page.goto('/setup')
  await expect(page.getByRole('heading', { name: 'تهيئة المنصة' })).toBeVisible()
  await page.fill('input[type=password]', 'wrong-password')
  await page.fill('input[type=email]', 'owner@naflaw.sa')
  await page.click('button.btn')
  await expect(page.locator('[role=alert][data-ok]')).toContainText('غير صحيحة')
  await page.fill('input[type=password]', ADMIN_PASSWORD)
  await page.click('button.btn')
  await expect(page.locator('[role=status][data-ok]')).toContainText('owner@naflaw.sa')
  await page.reload()
  await expect(page.locator('li[data-ok="1"]', { hasText: 'المالك' })).toBeVisible()
  await expect(page.locator('input[type=email]')).toHaveCount(0)
})
