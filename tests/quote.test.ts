import { test } from 'node:test'
import assert from 'node:assert/strict'
import { quote, normalizeCode, type QuoteCoupon } from '../src/lib/quote'

const now = new Date('2026-11-05T12:00:00+03:00')
const base = { courseId: 'c1', trackId: 't1', now }
const coupon = (o: Partial<QuoteCoupon> = {}): QuoteCoupon => ({
  code: 'NAF20', kind: 'percent', value: 20, scope: 'all', courseIds: [], trackIds: [], startsAt: null, endsAt: null,
  maxUses: null, maxPerLearner: null, minAmount: null, emailDomain: '', stackWithSale: true, active: true, ...o,
})

test('سعر واحد بلا خصومات والضريبة متضمّنة', () => {
  const q = quote({ ...base, price: { amount: 115000 }, quantity: 1 })
  assert.equal(q.total, 115000)
  assert.equal(q.vat, 15000)
})

test('العرض الساري يُحتسب ويُعلَّم', () => {
  const q = quote({ ...base, price: { amount: 80000, compareAt: 100000 }, quantity: 1 })
  assert.equal(q.unit, 80000); assert.equal(q.unitList, 100000); assert.ok(q.saleActive)
})

test('خصم المجموعة: أعلى قاعدة منطبقة فقط', () => {
  const rules = [{ minQty: 3, percent: 10 }, { minQty: 5, percent: 15 }]
  assert.equal(quote({ ...base, price: { amount: 100000 }, quantity: 2, groupRules: rules }).groupDiscount, 0)
  assert.equal(quote({ ...base, price: { amount: 100000 }, quantity: 3, groupRules: rules }).total, 270000)
  assert.equal(quote({ ...base, price: { amount: 100000 }, quantity: 6, groupRules: rules }).total, 510000)
})

test('العدد محصور بين 1 و50', () => {
  assert.equal(quote({ ...base, price: { amount: 100 }, quantity: 0 }).quantity, 1)
  assert.equal(quote({ ...base, price: { amount: 100 }, quantity: 999 }).quantity, 50)
})

test('كوبون نسبة بعد خصم المجموعة', () => {
  const q = quote({ ...base, price: { amount: 100000 }, quantity: 3, groupRules: [{ minQty: 3, percent: 10 }], coupon: coupon() })
  assert.equal(q.couponDiscount, 54000); assert.equal(q.total, 216000); assert.ok(q.couponApplied)
})

test('كوبون مبلغ لا يتجاوز المجموع، و100% منحة مجانية', () => {
  assert.equal(quote({ ...base, price: { amount: 30000 }, quantity: 1, coupon: coupon({ kind: 'amount', value: 50000 }) }).total, 0)
  const g = quote({ ...base, price: { amount: 30000 }, quantity: 1, coupon: coupon({ value: 100 }) })
  assert.equal(g.total, 0); assert.ok(g.free)
})

test('قواعد رفض الكوبون', () => {
  const p = { amount: 100000 }
  const e = (c: Partial<QuoteCoupon>, extra: Record<string, unknown> = {}) => quote({ ...base, price: p, quantity: 1, coupon: coupon(c), ...extra }).couponError
  assert.match(e({ active: false })!, /غير متاح/)
  assert.match(e({ startsAt: '2026-12-01T00:00:00Z' })!, /لم يبدأ/)
  assert.match(e({ endsAt: '2026-11-01T00:00:00Z' })!, /انتهت/)
  assert.match(e({ maxUses: 5 }, { uses: { total: 5, byLearner: 0 } })!, /استُنفد/)
  assert.match(e({ maxPerLearner: 1 }, { email: 'a@b.sa', uses: { total: 1, byLearner: 1 } })!, /من قبل/)
  assert.match(e({ scope: 'courses', courseIds: ['other'] })!, /الدورة/)
  assert.match(e({ scope: 'tracks', trackIds: ['other'] })!, /المسار/)
  assert.match(e({ emailDomain: 'company.sa' }, { email: 'x@gmail.com' })!, /company\.sa/)
  assert.equal(e({ emailDomain: '@company.sa' }, { email: 'X@Company.sa' }), undefined)
  assert.match(e({ minAmount: 200000 })!, /الحد الأدنى/)
  const sale = quote({ ...base, price: { amount: 80000, compareAt: 100000 }, quantity: 1, coupon: coupon({ stackWithSale: false }) })
  assert.match(sale.couponError!, /العرض/); assert.equal(sale.total, 80000)
})

test('الدورة المجانية لا تُطبّق عليها كوبونات', () => {
  const q = quote({ ...base, price: { amount: 0, free: true }, quantity: 1, coupon: coupon() })
  assert.equal(q.total, 0); assert.equal(q.couponApplied, false)
})

test('تطبيع رمز الكوبون', () => {
  assert.equal(normalizeCode(' naf-20 ؟ '), 'NAF-20')
})
