/* اتجاه البريد: يُستنتج من نص الرسالة ويُكرَّر على كل حاوية لأن عملاء البريد يُسقطون dir من <html> */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderEmail, textDir } from '../src/server/notify/templates'

const brand = { name: 'أكاديمية ناف', tagline: '', companyName: 'شركة ناف القانونية', showName: false, logo: null }

test('textDir: العربية rtl، والإنجليزية ltr، والخلو rtl', () => {
  assert.equal(textDir('نفّذنا الاسترداد لطلب NA-2026-000004'), 'rtl')
  assert.equal(textDir('Your refund for order NA-2026-000004 is done'), 'ltr')
  assert.equal(textDir('2026 · 5'), 'rtl')
})

test('رسالة عربية: rtl على الحاويات، والتسمية يميناً والقيمة يساراً بعزل اتجاهها', () => {
  const { html } = renderEmail({ site: 'https://x.test', brand, heading: 'نفّذنا الاسترداد', body: 'أُعيد المبلغ.\n\n- أولاً\n- ثانياً', facts: [['رقم الطلب', 'NA-2026-000004']], cta: { label: 'صفحة الطلب', href: 'https://x.test/o' } })
  assert.match(html, /<html lang="ar" dir="rtl">/)
  assert.match(html, /<body[^>]*dir="rtl"/)
  assert.doesNotMatch(html, /dir="ltr"|text-align:right;font-size:15px/)
  assert.match(html, /<ul[^>]*dir="rtl"[^>]*padding:0 22px 0 0/)
  assert.match(html, /<li dir="rtl"/)
  assert.match(html, /<p class="soft" dir="rtl"[^>]*text-align:right/)
  assert.match(html, /text-align:left;font-size:15px[^>]*><span dir="auto"[^>]*>NA-2026-000004</)
  assert.match(html, /إحدى مبادرات/)
})

test('رسالة إنجليزية: ltr على الحاويات وتذييل إنجليزي', () => {
  const { html } = renderEmail({ site: 'https://x.test', brand, heading: 'Refund processed', body: 'We refunded your order.\n\n- First\n- Second', facts: [['Order', 'NA-2026-000004']], unsubscribe: 'https://x.test/u' })
  assert.match(html, /<html lang="en" dir="ltr">/)
  assert.doesNotMatch(html, /dir="rtl"/)
  assert.match(html, /<ul[^>]*padding:0 0 0 22px/)
  assert.match(html, /An initiative of/)
  assert.match(html, />Unsubscribe</)
})

test('الاتجاه الصريح يغلب الاستنتاج', () => {
  const { html } = renderEmail({ site: '', brand, heading: 'Hello', body: 'Hi', dir: 'rtl' })
  assert.match(html, /<html lang="ar" dir="rtl">/)
})
