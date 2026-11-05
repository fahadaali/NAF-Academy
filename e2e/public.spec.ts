/* الواجهة العامة: الرئيسية بلا ستار عند تقليل الحركة، والكتالوج، وصفحة الدورة، وصور المشاركة */
import { expect, test } from '@playwright/test'

test.use({ reducedMotion: 'reduce' })

test('الرئيسية تعرض محتواها كاملاً مع تقليل الحركة', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(page.locator('h1').first()).toBeVisible()
  /* الستار لا يظهر لمن طلب تقليل الحركة */
  await expect(page.locator('html')).not.toHaveClass(/opening/)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await expect(page.locator('footer')).toBeVisible()
  expect(errors).toEqual([])
})

test('الكتالوج وصفحة الدورة والتسجيل', async ({ page }) => {
  await page.goto('/courses')
  const card = page.locator('a[href^="/courses/"]').filter({ hasText: /./ }).first()
  await expect(card).toBeVisible()
  await page.goto('/courses/evidence-system-deep-dive')
  await expect(page.locator('h1')).toBeVisible()
  await expect(page.locator('#enroll')).toBeVisible()
  await page.goto('/courses/evidence-system-deep-dive/enroll')
  await expect(page.getByRole('heading', { name: 'بياناتك' })).toBeVisible()
})

test('صورة المشاركة وملف التقويم', async ({ request }) => {
  const html = await (await request.get('/')).text()
  const og = html.match(/property="og:image" content="([^"]+)"/)?.[1]
  expect(og).toBeTruthy()
  const img = await request.get(new URL(og!).pathname + new URL(og!).search)
  expect(img.status()).toBe(200)
  expect(img.headers()['content-type']).toContain('image/png')
  const ics = await request.get('/courses/evidence-system-deep-dive/calendar')
  expect(ics.status()).toBe(200)
  expect(await ics.text()).toContain('BEGIN:VCALENDAR')
})
