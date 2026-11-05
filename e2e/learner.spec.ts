/* رحلة المتدرب: تسجيل مجاني بكوبون منحة، ودفع بالبوابة التجريبية حتى الفاتورة PDF، ثم «دوراتي» والإشعارات */
import { expect, test } from '@playwright/test'
import { adminPage, openChannelsAndPayments, verifyAt } from './helpers'

test.describe.configure({ mode: 'serial' })

test('منحة كاملة ثم «دوراتي» والإشعارات والإنجازات', async ({ browser }) => {
  const admin = await adminPage(browser)
  await openChannelsAndPayments(admin)
  await admin.goto('/admin/coupons/new')
  await admin.fill('input[dir=ltr] >> nth=0', 'GRANT100')
  await admin.locator('label:has-text("النسبة") input').fill('100')
  await admin.click('button.btn:has-text("حفظ")')
  await admin.waitForURL(/coupons\/[0-9a-f-]{36}$/)

  const g = await (await browser.newContext()).newPage()
  await g.goto('/courses/evidence-system-deep-dive/enroll?coupon=GRANT100')
  await verifyAt(g, admin, 'grant@firm.sa', 'متدربة المنحة', '0551110001')
  await g.check('aside input[type=checkbox]')
  await g.click('button:has-text("أكّد التسجيل")')
  await g.waitForURL(/\/orders\//)
  await g.goto('/learn')
  await expect(g.locator('#achievements')).toBeVisible()
  await expect(g.locator('article').first()).toBeVisible()
  await g.goto('/learn/inbox')
  await expect(g.locator('section[aria-labelledby=inbox-h] li').first()).toBeVisible()
})

test('شراء بالبوابة التجريبية حتى الفاتورة PDF', async ({ browser }) => {
  const admin = await adminPage(browser)
  await openChannelsAndPayments(admin)
  const g = await (await browser.newContext()).newPage()
  await g.goto('/courses/labor-disputes/enroll')
  await verifyAt(g, admin, 'buyer@firm.sa', 'مشترٍ تجريبي', '0551110002')
  await g.check('aside input[type=checkbox]')
  await g.click('button:has-text("تابع للدفع الآمن")')
  await g.waitForURL(/\/pay\?t=/)
  await g.click('button:has-text("محاكاة دفع ناجح")')
  await g.waitForURL(/\/orders\/NA-[\d-]+\?t=/)
  const invoice = g.locator('a[href*="/invoice/"]').first()
  await expect(invoice).toBeVisible()
  await invoice.click()
  await expect(g.locator('article header')).toBeVisible()
  const pdf = await g.locator('a:has-text("تنزيل PDF")').getAttribute('href')
  const r = await g.request.get(pdf!)
  expect(r.status()).toBe(200)
  expect((await r.body()).subarray(0, 5).toString()).toBe('%PDF-')
})
