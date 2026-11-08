/* وافق بالمحاكاة (WAFEQ_MOCK=1): الإعداد من اللوحة ← طلب مدفوع يُزامَن ← شارة «مُزامنة» في صفحة الطلب.
   يُعيد الربط مقفلاً في آخره فلا يمسّ بقية الملفات. */
import { expect, test } from '@playwright/test'
import { adminPage } from './helpers'

test('وافق: الإعداد ثم مزامنة طلب مدفوع', async ({ browser }) => {
  const a = await adminPage(browser)
  await a.goto('/admin/settings/wafeq')
  await expect(a.getByRole('heading', { name: /وافق/ }).first()).toBeVisible()
  await a.click('button:has-text("جلب الحسابات من وافق")')
  await expect(a.locator('text=متصل بـ')).toBeVisible()
  await a.locator('label:has-text("حساب الإيراد") select').selectOption('acc_rev')
  await a.locator('label:has-text("نسبة الضريبة") select').selectOption('tax_std')
  await a.locator('label:has-text("القبض: تحويل بنكي") select').selectOption('acc_moyasar')
  await a.click('button[role=switch]:has-text("مقفل")')
  await a.click('button.btn:has-text("حفظ")')
  await expect(a.locator('text=حُفظت — الربط مفعّل')).toBeVisible()

  try {
    await a.goto('/admin/orders/new')
    const course = a.locator('label:has-text("الدورة") select')
    const opts = await course.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean))
    await course.selectOption(opts[0])
    await a.locator('label:has-text("الاسم") input').fill('متدرب وافق')
    await a.locator('label:has-text("البريد") input').fill('wafeq-e2e@firm.sa')
    await a.click('button:has-text("تحويل بنكي")')
    await a.click('button:has-text("أنشئ الطلب")')
    await a.waitForURL(/\/admin\/orders\/[0-9a-f-]{36}$/)
    const panel = a.locator('section', { has: a.getByRole('heading', { name: 'وافق' }) })
    await expect(panel).toBeVisible()
    await expect(panel.locator('text=مُزامنة').first()).toBeVisible()
    await expect(panel.locator('text=REPORTED').first()).toBeVisible()
  } finally {
    await a.goto('/admin/settings/wafeq')
    await a.click('button[role=switch]:has-text("مفعّل")')
    await a.click('button.btn:has-text("حفظ")')
    await expect(a.locator('text=/^حُفظت$/')).toBeVisible()
  }
})
