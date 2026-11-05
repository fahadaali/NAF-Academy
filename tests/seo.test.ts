/* بيانات schema.org: الدورة بنمطها وموعدها وسعرها وتقييمها، ومسار التنقل، ومنع إغلاق الوسم */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { breadcrumbs, course, ldJson } from '../src/lib/seo'

const base = { slug: 'evidence', title: 'نظام الإثبات', description: 'دورة', mode: 'onsite', hours: 9, startsAt: '2026-12-14T16:00:00+03:00', city: 'الرياض', price: 189000, free: false, available: true, instructors: [{ name: 'د. سارة', slug: 'sara' }] }

test('الدورة الحضورية: CourseInstance بالمكان والعبء والسعر بالريال', () => {
  const c = course('https://a.sa', base) as Record<string, any>
  assert.equal(c['@type'], 'Course')
  assert.equal(c.offers.price, '1890.00')
  assert.equal(c.offers.priceCurrency, 'SAR')
  assert.equal(c.offers.availability, 'https://schema.org/InStock')
  const i = c.hasCourseInstance[0]
  assert.equal(i.courseMode, 'onsite')
  assert.equal(i.courseWorkload, 'PT9H')
  assert.equal(i.location.address.addressLocality, 'الرياض')
  assert.equal(i.instructor[0].url, 'https://a.sa/instructors/sara')
  assert.equal(c.aggregateRating, undefined, 'لا تقييم بلا مراجعات')
})

test('المسجّلة المجانية المكتملة بتقييم', () => {
  const c = course('https://a.sa', { ...base, mode: 'recorded', free: true, available: false, startsAt: null, rating: { avg: 4.6, count: 12 } }) as Record<string, any>
  assert.equal(c.offers.price, '0.00')
  assert.equal(c.offers.category, 'Free')
  assert.equal(c.offers.availability, 'https://schema.org/SoldOut')
  assert.equal(c.hasCourseInstance[0].courseMode, 'online')
  assert.equal(c.hasCourseInstance[0].location, undefined)
  assert.deepEqual(c.aggregateRating, { '@type': 'AggregateRating', ratingValue: 4.6, ratingCount: 12, bestRating: 5, worstRating: 1 })
})

test('مسار التنقل بروابط مطلقة، وJSON-LD لا يغلق الوسم', () => {
  const b = breadcrumbs('https://a.sa', [['الرئيسية', '/'], ['الدورات', '/courses']])
  assert.equal(b.itemListElement[1].item, 'https://a.sa/courses')
  assert.equal(b.itemListElement[1].position, 2)
  assert.doesNotMatch(ldJson({ x: '</script><script>alert(1)</script>' }), /<\/script>/)
})
