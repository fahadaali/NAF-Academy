/* يُشغَّل أخيراً (الملفات بالترتيب الأبجدي، عامل واحد): يترك دفعة فيها متدرب على أول دورة — لا تُحذف دفعة فيها متدربون */
import { expect, test } from '@playwright/test'
import { adminPage } from './helpers'

test('طلب يدوي لدورة بدفعة: يختار الدفعة ويسجّل', async ({ browser }) => {
  const a = await adminPage(browser)
  await a.goto('/admin/courses')
  await a.locator('a[href^="/admin/courses/"]:not([href$="/new"])').first().click()
  await a.waitForURL(/\/admin\/courses\/[0-9a-f-]{36}$/)
  const slug = (await a.locator('a[href*="/preview/"]').first().getAttribute('href'))!.split('/')[2]
  await a.click('role=tab[name="الدفعات"]')
  await a.click('button:has-text("+ دفعة")')
  await a.fill('input[placeholder^="الدفعة الثالثة"]', 'دفعة الطلب اليدوي')
  await a.click('button:has-text("التسجيل مفتوح")')
  await a.click('button:has-text("حفظ الدفعة")')
  await expect(a.locator('text=دفعة الطلب اليدوي').first()).toBeVisible()
  await a.goto('/admin/orders/new')
  await a.locator('label:has-text("الدورة") select').selectOption(slug)
  await expect(a.locator('label:has-text("الدفعة") select')).toBeVisible()
  await a.locator('label:has-text("الاسم") input').fill('متدرب يدوي')
  await a.locator('label:has-text("البريد") input').fill('manual-cohort@firm.sa')
  await a.click('button:has-text("تحويل بنكي")')
  await a.click('button:has-text("أنشئ الطلب")')
  await a.waitForURL(/\/admin\/orders\/[0-9a-f-]{36}$/)
})
