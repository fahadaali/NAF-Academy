/* المرحلة أ: بداية العرض والعروض العامة، والدفعات، وانتهاء الوصول — دوال نقية */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { priceView, promoPrice } from '../src/lib/pricing'
import { quote } from '../src/lib/quote'
import { accessUntilFor, cohortState, hasAccess, leadCohort, statusWithCohorts, withSession, type CohortLite } from '../src/lib/cohorts'

const now = new Date('2026-11-05T12:00:00+03:00')
const iso = (d: string) => new Date(d).toISOString()

test('عرض الدورة قبل بدايته يُدفع بالسعر الأصلي، وفي نافذته بالعرض', () => {
  const p = { amount: 200000, compareAt: 300000, saleStartsAt: iso('2026-11-10T00:00:00+03:00'), saleEndsAt: iso('2026-11-20T00:00:00+03:00') }
  assert.equal(priceView(p, now).current, 300000)
  assert.equal(priceView(p, now).original, undefined)
  const mid = priceView(p, new Date('2026-11-15T00:00:00+03:00'))
  assert.equal(mid.current, 200000)
  assert.equal(mid.original, 300000)
  assert.equal(priceView(p, new Date('2026-11-21T00:00:00+03:00')).current, 300000)
})

test('العرض العام يُطبَّق على السعر الأصلي ويحمل اسمه ونهايته', () => {
  const v = priceView({ amount: 300000, promos: [{ label: 'اليوم الوطني', kind: 'percent', value: 25, endsAt: iso('2026-11-30T00:00:00+03:00') }] }, now)
  assert.equal(v.current, 225000)
  assert.equal(v.original, 300000)
  assert.equal(v.savePct, 25)
  assert.equal(v.label, 'اليوم الوطني')
  assert.ok(v.endsAt)
})

test('الأفضل للمشتري بين عرض الدورة والعرض العام — بلا تراكم', () => {
  const base = { amount: 240000, compareAt: 300000 } // عرض الدورة 20%
  const small = priceView({ ...base, promos: [{ label: 'عام', kind: 'percent', value: 10 }] }, now)
  assert.equal(small.current, 240000)
  assert.equal(small.label, undefined)
  const big = priceView({ ...base, promos: [{ label: 'عام', kind: 'percent', value: 30 }] }, now)
  assert.equal(big.current, 210000)
  assert.equal(big.label, 'عام')
})

test('العرض العام خارج نافذته لا يُحسب، والمبلغ الثابت لا ينزل تحت الصفر', () => {
  const later = priceView({ amount: 100000, promos: [{ label: 'لاحق', kind: 'percent', value: 50, startsAt: iso('2026-12-01T00:00:00+03:00') }] }, now)
  assert.equal(later.current, 100000)
  assert.equal(promoPrice(100000, { kind: 'amount', value: 150000 }), 0)
  assert.equal(promoPrice(100000, { kind: 'percent', value: 99 }), 10000, 'النسبة تُقيَّد بـ 90%')
})

test('التسعير الموثوق يأخذ العرض العام، والكوبون غير المجتمع يُرفض معه', () => {
  const coupon = { code: 'X', kind: 'percent' as const, value: 10, scope: 'all' as const, courseIds: [], trackIds: [], startsAt: null, endsAt: null, maxUses: null, maxPerLearner: null, minAmount: null, emailDomain: '', stackWithSale: false, active: true }
  const q = quote({ price: { amount: 100000, promos: [{ label: 'عام', kind: 'percent', value: 20 }] }, quantity: 2, courseId: 'c', coupon, now })
  assert.equal(q.unit, 80000)
  assert.equal(q.unitList, 100000)
  assert.equal(q.saleActive, true)
  assert.equal(q.couponApplied, false)
  assert.match(q.couponError ?? '', /لا يجتمع/)
})

const k = (x: Partial<CohortLite>): CohortLite => ({ id: 'k', title: 'د', status: 'open', startsAt: null, endsAt: null, seatsTotal: null, taken: 0, city: '', ...x })

test('حالة الدفعة: المغلقة والمنتهية والمكتملة والقادمة', () => {
  assert.equal(cohortState(k({ status: 'closed' }), now), 'closed')
  assert.equal(cohortState(k({ endsAt: iso('2026-11-01T00:00:00+03:00') }), now), 'closed')
  assert.equal(cohortState(k({ seatsTotal: 10, taken: 10 }), now), 'full')
  assert.equal(cohortState(k({ status: 'soon' }), now), 'soon')
  assert.equal(cohortState(k({ seatsTotal: 10, taken: 3 }), now), 'open')
})

test('الدورة ذات الدفعات تتبع أفضل دفعاتها، والدفعة الممثّلة أقرب مفتوحة', () => {
  const a = k({ id: 'a', startsAt: iso('2027-01-10T09:00:00+03:00'), seatsTotal: 5, taken: 5 })
  const b = k({ id: 'b', startsAt: iso('2027-02-10T09:00:00+03:00') })
  const c = k({ id: 'c', startsAt: iso('2027-03-10T09:00:00+03:00'), status: 'soon' })
  assert.equal(statusWithCohorts('open', [a, b, c], now), 'open')
  assert.equal(leadCohort([a, b, c], now)?.id, 'b')
  assert.equal(statusWithCohorts('open', [a, c], now), 'full')
  assert.equal(statusWithCohorts('open', [c], now), 'soon')
  assert.equal(statusWithCohorts('open', [k({ status: 'closed' })], now), 'closed')
  assert.equal(statusWithCohorts('draft', [b], now), 'draft', 'المسودة تبقى مسودة')
  assert.equal(statusWithCohorts('open', [], now), 'open', 'بلا دفعات كما هي')
})

test('الوصول: من الآن أو من نهاية الدفعة اللاحقة، وبلا أيام دائم', () => {
  assert.equal(accessUntilFor(null, null, now), null)
  assert.equal(accessUntilFor(30, null, now), new Date(now.getTime() + 30 * 864e5).toISOString())
  const end = iso('2026-12-01T00:00:00+03:00')
  assert.equal(accessUntilFor(10, end, now), new Date(Date.parse(end) + 10 * 864e5).toISOString())
  assert.equal(hasAccess({ status: 'active', accessUntil: null }, now), true)
  assert.equal(hasAccess({ status: 'active', accessUntil: iso('2026-11-01T00:00:00+03:00') }, now), false)
  assert.equal(hasAccess({ status: 'canceled', accessUntil: null }, now), false)
})

test('موعد الدرس من جلسة الدفعة إن وُجدت، والرابط والمكان يرجعان للدرس إن فرغا، والتسجيل لا يُورث', () => {
  const l = { id: 'l1', startsAt: 'A', endsAt: 'B', joinUrl: 'https://x', location: 'قاعة 1', recording: { provider: 'url', url: 'https://old' } as unknown }
  assert.deepEqual(withSession(l, null), l)
  const m = new Map([['l1', { startsAt: 'C', endsAt: 'D', joinUrl: '', location: '', recording: null }]])
  const x = withSession(l, m)
  assert.equal(x.startsAt, 'C')
  assert.equal(x.joinUrl, 'https://x')
  assert.equal(x.location, 'قاعة 1')
  assert.deepEqual(x.recording, { provider: 'none' })
})
