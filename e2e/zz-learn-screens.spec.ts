/* صفحات المتدرب على الجوال: لوحته ودوراته وكل درس (ومنه الواجب بحقل الملف) — لا شيء خارج الشاشة ولا مقصوص.
   في zz-: يسجّل متدرباً بكوبون منحة فيأخذ مقعداً. */
import { expect, test } from '@playwright/test'
import { adminPage, openChannelsAndPayments, overflow, verifyAt } from './helpers'

test('صفحات المتدرب والدروس على 360 و390px', async ({ browser }) => {
  const admin = await adminPage(browser)
  await openChannelsAndPayments(admin)
  await admin.goto('/admin/coupons/new')
  await admin.fill('input[dir=ltr] >> nth=0', 'SCREENS100')
  await admin.locator('label:has-text("النسبة") input').fill('100')
  await admin.click('button.btn:has-text("حفظ")')
  await admin.waitForURL(/coupons\/[0-9a-f-]{36}$/)

  const g = await (await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true })).newPage()
  await g.goto('/courses/evidence-system-deep-dive/enroll?coupon=SCREENS100')
  await verifyAt(g, admin, 'screens@firm.sa', 'متدرب الشاشات', '0551110077')
  await g.check('aside input[type=checkbox]')
  await g.click('button:has-text("أكّد التسجيل")')
  await g.waitForURL(/\/orders\//)

  await g.goto('/learn/evidence-system-deep-dive')
  const lessons = [...new Set(await g.locator('a[href^="/learn/evidence-system-deep-dive/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')!.split('?')[0])))]
  expect(lessons.length).toBeGreaterThan(1)
  const paths = ['/learn', '/learn/inbox', '/learn/certificates', '/learn/orders', '/learn/profile', '/learn/evidence-system-deep-dive', ...lessons]
  let files = 0
  for (const w of [360, 390]) {
    await g.setViewportSize({ width: w, height: 800 })
    for (const path of paths) {
      await g.goto(path)
      await g.waitForLoadState('networkidle')
      expect(await g.evaluate(overflow), `${w} ${path}`).toEqual({ scroll: 0, bad: [] })
      files += await g.locator('input[type=file]').count()
    }
  }
  /* الفحص شمل درس الواجب بحقل الملف — أعرض الحقول وسبب المشكلة الأصلي */
  expect(files).toBeGreaterThan(0)
})
