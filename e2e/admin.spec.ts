/* اللوحة: الهوية، والدفعات على صفحة الدورة العامة، والعرض العام، وسجل النسخ، وصلاحيات العضو */
import { expect, test } from '@playwright/test'
import { adminPage } from './helpers'

test.describe.configure({ mode: 'serial' })

test('الهوية والشعارات بصيغها الثلاث', async ({ browser }) => {
  const a = await adminPage(browser)
  await a.goto('/admin/brand')
  for (const t of ['الشعار الكامل', 'صيغة الشريط', 'الرمز']) await expect(a.locator('h2', { hasText: t }).first()).toBeVisible()
})

test('دفعة جديدة تظهر في صفحة الدورة وتُختار عند التسجيل', async ({ browser }) => {
  const a = await adminPage(browser)
  await a.goto('/admin/courses')
  await a.locator('a[href^="/admin/courses/"]:not([href$="/new"])').first().click()
  await a.waitForURL(/\/admin\/courses\/[0-9a-f-]{36}$/)
  const slug = (await a.locator('a[href*="/preview/"]').first().getAttribute('href'))!.split('/')[2]
  await a.click('role=tab[name="الدفعات"]')
  await a.click('button:has-text("+ دفعة")')
  await a.fill('input[placeholder^="الدفعة الثالثة"]', 'دفعة الاختبار')
  await a.click('button:has-text("التسجيل مفتوح")')
  await a.locator('input[type=datetime-local]').first().fill('2027-03-01T18:00')
  await a.click('button:has-text("حفظ الدفعة")')
  await expect(a.locator('text=دفعة الاختبار').first()).toBeVisible()
  const pub = await (await browser.newContext()).newPage()
  await pub.goto(`/courses/${slug}`)
  await expect(pub.locator('#cohorts-h')).toBeVisible()
  await pub.goto(`/courses/${slug}/enroll`)
  await expect(pub.locator('text=اختر الدفعة')).toBeVisible()
  /* تنظيف: الدفعة تجعل الاختيار شرطاً، فلا تبقى لاختبارات المتدرب */
  await a.locator('li', { hasText: 'دفعة الاختبار' }).locator('button', { hasText: 'حذف' }).click()
  await expect(a.locator('li', { hasText: 'دفعة الاختبار' })).toHaveCount(0)
})

test('عرض عام يظهر باسمه بجوار السعر', async ({ browser }) => {
  const a = await adminPage(browser)
  await a.goto('/admin/promotions')
  await a.click('button:has-text("+ عرض")')
  await a.locator('main input:not([type=hidden])').first().fill('عرض الاختبار')
  await a.locator('input[type=number]').fill('20')
  await a.click('button:has-text("حفظ")')
  await expect(a.locator('text=عرض الاختبار').first()).toBeVisible()
  const pub = await (await browser.newContext()).newPage()
  await pub.goto('/courses/evidence-system-deep-dive')
  await expect(pub.locator('text=عرض الاختبار').first()).toBeVisible()
  /* تنظيف: العرض العام يمنع تراكم كوبون المنحة في اختبارات المتدرب */
  await a.locator('tr', { hasText: 'عرض الاختبار' }).locator('button', { hasText: 'حذف' }).click()
  await expect(a.locator('tr', { hasText: 'عرض الاختبار' })).toHaveCount(0)
})

test('سجل النسخ في محرّر الدورة، وصلاحيات عضو مدعو', async ({ browser }) => {
  const a = await adminPage(browser)
  await a.goto('/admin/courses')
  await a.locator('a[href^="/admin/courses/"]:not([href$="/new"])').first().click()
  await a.waitForURL(/\/admin\/courses\/[0-9a-f-]{36}$/)
  await a.click('button:has-text("السجل")')
  await expect(a.locator('[aria-label="سجل النسخ"]')).toBeVisible()
  await a.goto('/admin/team')
  await a.fill('input[dir=ltr]', 'teammate@naf.sa')
  await a.click('button:has-text("أرسل الدعوة")')
  await a.locator('button', { hasText: 'الصلاحيات' }).first().click()
  await expect(a.locator('dialog[open]')).toBeVisible()
  await a.locator('dialog[open] select').first().selectOption({ index: 1 })
  await a.click('dialog[open] button:has-text("حفظ الصلاحيات")')
  await expect(a.locator('text=مخصّصة').first()).toBeVisible()
})
