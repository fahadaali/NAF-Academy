import { test } from 'node:test'
import assert from 'node:assert/strict'
import { priceView, formatAmount } from '../src/lib/pricing'

const now = new Date('2026-11-05T12:00:00+03:00')

test('عرض ساري يُظهر السعر الأصلي والتوفير', () => {
  const v = priceView({ amount: 249000, compareAt: 349000, saleEndsAt: '2026-11-30T23:59:00+03:00' }, now)
  assert.equal(v.current, 249000)
  assert.equal(v.original, 349000)
  assert.equal(v.savePct, 29)
  assert.ok(v.endsAt)
})

test('عرض منتهٍ يعود للسعر الأصلي تلقائياً', () => {
  const v = priceView({ amount: 249000, compareAt: 349000, saleEndsAt: '2026-11-01T00:00:00+03:00' }, now)
  assert.equal(v.current, 349000)
  assert.equal(v.original, undefined)
})

test('عرض بلا تاريخ انتهاء يبقى سارياً', () => {
  const v = priceView({ amount: 79000, compareAt: 99000 }, now)
  assert.equal(v.current, 79000)
  assert.equal(v.savePct, 20)
  assert.equal(v.endsAt, undefined)
})

test('سعر مقارنة أقل من الحالي لا يُعد عرضاً', () => {
  const v = priceView({ amount: 100000, compareAt: 90000 }, now)
  assert.equal(v.current, 100000)
  assert.equal(v.original, undefined)
})

test('المجاني', () => {
  assert.equal(priceView({ amount: 0 }, now).free, true)
  assert.equal(priceView({ amount: 0 }, now).original, undefined)
})

test('دورة صار سعرها صفراً يبقى سعرها السابق مشطوباً بجانب «مجاناً»', () => {
  const v = priceView({ amount: 0, compareAt: 249000 }, now)
  assert.equal(v.free, true)
  assert.equal(v.current, 0)
  assert.equal(v.original, 249000)
})

test('العرض المجاني في نافذته فقط — قبلها وبعدها السعر الأصلي', () => {
  const p = { amount: 0, compareAt: 249000, saleStartsAt: '2026-11-10T00:00:00+03:00', saleEndsAt: '2026-11-20T00:00:00+03:00' }
  const before = priceView(p, now)
  assert.equal(before.free, false)
  assert.equal(before.current, 249000)
  const mid = priceView(p, new Date('2026-11-15T00:00:00+03:00'))
  assert.equal(mid.free, true)
  assert.equal(mid.original, 249000)
  assert.ok(mid.endsAt, 'يظهر عدّاد انتهاء العرض')
  assert.equal(priceView(p, new Date('2026-11-21T00:00:00+03:00')).current, 249000)
})

test('مفتاح «مجانية» مع سعر سابق يُظهره مشطوباً، وبلا سعر سابق «مجاناً» وحدها', () => {
  assert.equal(priceView({ amount: 249000, compareAt: 349000, free: true }, now).original, 349000)
  assert.equal(priceView({ amount: 249000, free: true }, now).original, undefined)
  assert.equal(priceView({ amount: 249000, free: true }, now).current, 0)
})

test('عرض عام بمبلغ ثابت يبلغ الصفر: مجانية مؤقتة بسعرها السابق واسم العرض', () => {
  const v = priceView({ amount: 100000, promos: [{ label: 'هدية', kind: 'amount', value: 150000, endsAt: '2026-11-30T00:00:00+03:00' }] }, now)
  assert.equal(v.free, true)
  assert.equal(v.current, 0)
  assert.equal(v.original, 100000)
  assert.equal(v.label, 'هدية')
})

test('تنسيق المبلغ', () => {
  assert.equal(formatAmount(249000), '2,490')
  assert.equal(formatAmount(12550), '125.50')
})

import { publicOrder, resolveStatus } from '../src/lib/course-meta'

test('المجدولة تُفتح عند موعدها فقط', () => {
  assert.equal(resolveStatus('scheduled', '2026-11-01T00:00:00Z', now), 'open')
  assert.equal(resolveStatus('scheduled', '2026-12-01T00:00:00Z', now), 'scheduled')
  assert.equal(resolveStatus('scheduled', null, now), 'scheduled')
  assert.equal(resolveStatus('closed', null, now), 'closed')
})

test('ترتيب العرض: المفتوح الأقرب أولاً والمنتهي آخراً', () => {
  const list = [
    { status: 'closed' as const, startsAt: '2026-10-01' },
    { status: 'open' as const, startsAt: '2026-12-20' },
    { status: 'open' as const, startsAt: '2026-12-01' },
    { status: 'full' as const, startsAt: '2026-11-20' },
  ].sort(publicOrder)
  assert.deepEqual(list.map((c) => c.startsAt), ['2026-12-01', '2026-12-20', '2026-11-20', '2026-10-01'])
})
