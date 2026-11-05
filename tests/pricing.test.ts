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
