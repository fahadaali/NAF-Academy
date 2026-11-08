/* Cloudflare Stream (بالمحاكاة المحلية): رفع فيديو لدرس بطلب مباشر وبـ tus حتى «جاهز»، والحفظ،
   ثم الحماية: لا معرّف الفيديو في أي صفحة، والمسجّل وحده يأخذ رابط مشغّل موقّعاً؛ وWebhook يُفعَّل من اللوحة ويرفض التوقيع المزوّر.
   (يترك أثراً في درس دورة الإثبات — لذا يجري قرب الأخير) */
import { createHmac } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { adminPage, openChannelsAndPayments, verifyAt } from './helpers'

test.describe.configure({ mode: 'serial' })

const SLUG = 'evidence-system-deep-dive'
const LESSON = 'قراءة النص وتفكيكه'
let uid = ''

const video = (mb: number, name: string) => ({ name, mimeType: 'video/mp4', buffer: Buffer.alloc(Math.round(mb * 1024 * 1024), 7) })

async function lessonPanel(a: Page) {
  await a.goto('/admin/courses')
  await a.getByRole('link', { name: /نظام الإثبات/ }).first().click()
  await a.getByRole('tab', { name: 'المنهج' }).click()
  const row = a.locator('div').filter({ has: a.locator(`input[value="${LESSON}"]`) }).last()
  await row.getByRole('button', { name: /التفاصيل/ }).click()
}

test('رفع فيديو لدرس: طلب مباشر ثم tus، ومؤشر المعالجة حتى «جاهز»', async ({ browser }) => {
  const a = await adminPage(browser)
  await lessonPanel(a)
  await a.getByText('Cloudflare Stream', { exact: true }).click()
  const file = a.locator('input[type=file][accept="video/*"]')

  /* أكبر من حدّ tus في المحاكاة (2MB) */
  await file.setInputFiles(video(3, 'big-lesson.mp4'))
  await expect(a.getByText('رُفع — احفظ الدورة')).toBeVisible({ timeout: 30_000 })
  await expect(a.locator('[role=status][data-state]')).toContainText('جاهز للعرض', { timeout: 30_000 })
  const first = await a.locator('details input[dir=ltr]').inputValue()
  expect(first).toMatch(/^[a-f0-9]{32}$/)

  /* ملف صغير: طلب مباشر، ويحلّ محل السابق */
  await file.setInputFiles(video(0.5, 'small-lesson.mp4'))
  await expect(a.locator('details input[dir=ltr]')).not.toHaveValue(first, { timeout: 30_000 })
  await expect(a.locator('[role=status][data-state]')).toContainText('جاهز للعرض', { timeout: 30_000 })
  uid = await a.locator('details input[dir=ltr]').inputValue()
  expect(uid).toMatch(/^[a-f0-9]{32}$/)
  await expect(a.locator('[role=status][data-state]')).toContainText('1:01')

  await a.getByRole('button', { name: 'حفظ', exact: true }).click()
  await expect(a.getByText(/حُفظ|تم الحفظ/).first()).toBeVisible()

  /* اللوحة: الفيديو في «الجلسات والحضور» بحالته */
  await a.goto('/admin/learning/sessions')
  await expect(a.locator('tr', { hasText: 'small-lesson.mp4' })).toContainText('جاهز')
})

test('الحماية: لا معرّف في الصفحات، والمسجّل وحده يأخذ رابطاً موقّعاً', async ({ browser }) => {
  expect(uid).toMatch(/^[a-f0-9]{32}$/)
  /* زائر: صفحة الدورة بلا المعرّف، والدرس يطلب الدخول */
  const v = await (await browser.newContext()).newPage()
  const pub = await v.request.get(`/courses/${SLUG}`)
  expect(await pub.text()).not.toContain(uid)
  await v.goto(`/learn/${SLUG}`)
  expect(await v.content()).not.toContain(uid)

  /* متدرب مسجّل بمنحة */
  const admin = await adminPage(browser)
  await openChannelsAndPayments(admin)
  await admin.goto('/admin/coupons/new')
  await admin.fill('input[dir=ltr] >> nth=0', 'STREAMGRANT')
  await admin.locator('label:has-text("النسبة") input').fill('100')
  await admin.click('button.btn:has-text("حفظ")')
  await admin.waitForURL(/coupons\/[0-9a-f-]{36}$/)
  const g = await (await browser.newContext()).newPage()
  await g.goto(`/courses/${SLUG}/enroll?coupon=STREAMGRANT`)
  await verifyAt(g, admin, 'stream@firm.sa', 'متدرب الفيديو', '0551110077')
  await g.check('aside input[type=checkbox]')
  await g.click('button:has-text("أكّد التسجيل")')
  await g.waitForURL(/\/orders\//)

  await g.goto(`/learn/${SLUG}`)
  await g.getByRole('link', { name: new RegExp(LESSON) }).first().click()
  const frame = g.locator('iframe[title="فيديو الدرس"]')
  await expect(frame).toBeVisible()
  const src = (await frame.getAttribute('src')) ?? ''
  expect(src).toMatch(/^https:\/\/customer-mock\.cloudflarestream\.com\/mock\.[\w-]+\/iframe\?/)
  expect(src).toContain('poster=')
  expect(src).not.toContain(uid)
  expect(await g.content()).not.toContain(uid)
  expect(await (await g.request.get(`/courses/${SLUG}`)).text()).not.toContain(uid)
})

test('Webhook اكتمال المعالجة: يُفعَّل من اللوحة ويرفض التوقيع المزوّر', async ({ browser, request }) => {
  /* قبل التفعيل مقفل */
  expect((await request.post('/api/stream/webhook', { data: {} })).status()).toBe(404)
  const a = await adminPage(browser)
  await a.goto('/admin/learning/sessions')
  await a.getByRole('button', { name: 'تفعيل إشعار Stream' }).click()
  await expect(a.getByText('إشعار اكتمال المعالجة مفعّل')).toBeVisible()
  /* السرّ لا يظهر في الصفحة */
  expect(await a.content()).not.toContain('mock-webhook-secret')

  const body = JSON.stringify({ uid, readyToStream: true, duration: 75, status: { state: 'ready' } })
  const time = Math.floor(Date.now() / 1000)
  const sig = createHmac('sha256', 'mock-webhook-secret-0123456789abcdef').update(`${time}.${body}`).digest('hex')
  const bad = await request.post('/api/stream/webhook', { data: body, headers: { 'content-type': 'application/json', 'webhook-signature': `time=${time},sig1=${'0'.repeat(64)}` } })
  expect(bad.status()).toBe(401)
  const ok = await request.post('/api/stream/webhook', { data: body, headers: { 'content-type': 'application/json', 'webhook-signature': `time=${time},sig1=${sig}` } })
  expect(ok.status()).toBe(200)
  await a.reload()
  await expect(a.locator('tr', { hasText: 'small-lesson.mp4' })).toContainText('1:15')
})
