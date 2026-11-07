/* البرنامج التعاوني: إضافة مشاركين من اللوحة — دعوة بالبريد ← قبول المدعو ببياناته ← مساحة التعلّم، والرابط لمرة واحدة؛
   ثم تسجيل مباشر. (zz-r: بعد zz-orders وقبل zz-setup الذي يغيّر كلمة مرور المالك — ويترك تسجيلين في دورة «قريباً» لا يمسّها غيره) */
import { expect, test } from '@playwright/test'
import { adminPage, openChannelsAndPayments } from './helpers'

const COURSE = 'ai-for-legal-departments'

test('دعوة مشارك بالبريد وقبولها، والتسجيل المباشر', async ({ browser }) => {
  const admin = await adminPage(browser)
  await openChannelsAndPayments(admin)
  await admin.goto('/admin/courses')
  const href = await admin.locator('tr', { hasText: `/${COURSE}` }).getByRole('link').first().getAttribute('href')
  expect(href).toMatch(/^\/admin\/courses\/[\w-]+$/)

  /* دعوة: لصق القائمة ← المعاينة ← الإرسال */
  await admin.goto(`${href}/learners/add`)
  await expect(admin.getByRole('heading', { name: 'إضافة مشاركين' })).toBeVisible()
  await admin.getByRole('textbox', { name: 'ألصق القائمة' }).fill('الاسم,البريد\nطالبة التعاون,coop1@uni.edu.sa\nسطر بلا بريد')
  await expect(admin.getByRole('note').filter({ hasText: 'لا بريد في هذا السطر' })).toBeVisible()
  await admin.getByRole('button', { name: 'إرسال 1 دعوة' }).click()
  await expect(admin.getByRole('cell', { name: /دُعي/ })).toBeVisible()

  /* الرابط من صندوق الرسائل التجريبي */
  await admin.goto('/admin/messages')
  const row = admin.locator('tr', { hasText: 'coop1@uni.edu.sa' }).first()
  await expect(row).toBeVisible()
  const path = (await row.textContent())?.match(/\/invite\?t=[\w%.-]+/)?.[0]
  expect(path).toBeTruthy()

  /* المدعو يكمل بياناته فيُسجَّل ويدخل */
  const s = await (await browser.newContext()).newPage()
  await s.goto(path!)
  await expect(s.locator('input[type=email]')).toHaveValue('coop1@uni.edu.sa')
  await expect(s.locator('input[name=name]')).toHaveValue('طالبة التعاون')
  await s.fill('input[name=phone]', '123')
  await s.getByRole('button', { name: 'قبول الدعوة والدخول' }).click()
  await expect(s.getByText('رقم جوال غير صالح')).toBeVisible()
  await s.fill('input[name=phone]', '0551239876')
  await s.getByRole('button', { name: 'قبول الدعوة والدخول' }).click()
  await s.waitForURL(new RegExp(`/learn/${COURSE}`))

  /* الرابط لا يصلح مرتين */
  const again = await (await browser.newContext()).newPage()
  await again.goto(path!)
  await expect(again.getByRole('alert')).toContainText('الرابط غير صالح')

  /* تسجيل مباشر */
  await admin.goto(`${href}/learners/add`)
  await admin.getByRole('radio', { name: 'تسجيل مباشر' }).click()
  await admin.getByRole('textbox', { name: 'ألصق القائمة' }).fill('coop2@uni.edu.sa,طالب التسجيل المباشر')
  await admin.getByRole('button', { name: 'تسجيل 1 مشارك' }).click()
  await expect(admin.getByRole('cell', { name: 'سُجّل', exact: true })).toBeVisible()

  /* المسجّلون والدعوات */
  await admin.goto(`${href}/learners`)
  await expect(admin.getByRole('link', { name: 'طالبة التعاون' })).toBeVisible()
  await expect(admin.getByRole('link', { name: 'طالب التسجيل المباشر' })).toBeVisible()
  await expect(admin.getByRole('heading', { name: 'الدعوات' })).toBeVisible()
  await expect(admin.getByText('قُبلت')).toBeVisible()
})
