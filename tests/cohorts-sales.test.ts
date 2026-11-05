/* تكامل الدفعات والوصول والعروض العامة على قاعدة مؤقتة: اختيار الدفعة شرط، ومقاعدها مستقلة،
   والتسجيل يحمل دفعته ونهاية وصوله، والمنتهي وصوله يجدّد فيمتدّ تسجيله، والعرض العام يدخل السعر الموثوق. */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'naf-cohorts-'))
process.env.DATABASE_URL = `file:${join(dir, 't.db')}`
process.env.PAYMENTS_GATEWAY = 'mock'

let m: typeof import('../src/server/sales')
let db: typeof import('../src/server/db')['db']
let s: typeof import('../src/server/db')['schema']
const who = (email: string) => ({ name: 'متدرب', email, phone: '', org: '', vatNumber: '' })
const pay = async (o: { id: string; total: number }) => m.confirmPayment(`mock_${o.id}_${o.total}_paid`, o.id)

before(async () => {
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  ;({ db, schema: s } = await import('../src/server/db'))
  await migrate(db, { migrationsFolder: './migrations' })
  m = await import('../src/server/sales')
  const { setSetting, DEFAULT_PAYMENTS } = await import('../src/server/settings')
  await setSetting('payments', { ...DEFAULT_PAYMENTS, enabled: true })
  await db.insert(s.courses).values({ id: 'c1', slug: 'c1', title: 'دورة بدفعات', status: 'open', price: 100000, accessDays: 30, previewToken: 'x' })
  await db.insert(s.cohorts).values([
    { id: 'k1', courseId: 'c1', title: 'الأولى', status: 'open', seatsTotal: 1, endsAt: new Date(Date.now() + 10 * 864e5).toISOString() },
    { id: 'k2', courseId: 'c1', title: 'الثانية', status: 'open', seatsTotal: 5 },
    { id: 'k3', courseId: 'c1', title: 'القادمة', status: 'soon' },
  ])
})

test('الدورة ذات الدفعات تشترط دفعة مفتوحة، وسعة كل دفعة مستقلة', async () => {
  const none = await m.placeOrder({ slug: 'c1', quantity: 1, buyer: who('a@x.sa'), attendSelf: true })
  assert.equal(none.ok, false)
  assert.match(!none.ok ? none.error : '', /اختر الدفعة/)
  const soon = await m.placeOrder({ slug: 'c1', cohortId: 'k3', quantity: 1, buyer: who('a@x.sa'), attendSelf: true })
  assert.equal(soon.ok, false)

  const a = await m.placeOrder({ slug: 'c1', cohortId: 'k1', quantity: 1, buyer: who('a@x.sa'), attendSelf: true })
  assert.ok(a.ok, !a.ok ? a.error : '')
  /* الأولى سعتها مقعد واحد محجوز الآن لطلب معلّق */
  const full = await m.placeOrder({ slug: 'c1', cohortId: 'k1', quantity: 1, buyer: who('b@x.sa'), attendSelf: true })
  assert.equal(full.ok, false)
  const other = await m.placeOrder({ slug: 'c1', cohortId: 'k2', quantity: 1, buyer: who('b@x.sa'), attendSelf: true })
  assert.ok(other.ok)

  if (!a.ok) return
  assert.equal((await pay(a.order)).outcome, 'paid')
  const [e] = await db.select().from(s.enrollments).where((await import('drizzle-orm')).eq(s.enrollments.orderId, a.order.id))
  assert.equal(e.cohortId, 'k1')
  /* الوصول 30 يوماً من نهاية الدفعة (بعد 10 أيام) */
  const days = (Date.parse(e.accessUntil!) - Date.now()) / 864e5
  assert.ok(days > 39.9 && days < 40.1, `الوصول ${days} يوماً`)
})

test('المنتهي وصوله يجدّد: يمتدّ التسجيل نفسه ولا يُنشأ تسجيل ثانٍ', async () => {
  const { eq } = await import('drizzle-orm')
  const [e] = await db.select().from(s.enrollments).where(eq(s.enrollments.cohortId, 'k1'))
  await db.update(s.enrollments).set({ accessUntil: new Date(Date.now() - 864e5).toISOString() }).where(eq(s.enrollments.id, e.id))
  const r = await m.placeOrder({ slug: 'c1', cohortId: 'k2', quantity: 1, buyer: who('a@x.sa'), attendSelf: true })
  assert.ok(r.ok, !r.ok ? r.error : '')
  if (!r.ok) return
  await pay(r.order)
  const rows = await db.select().from(s.enrollments).where(eq(s.enrollments.learnerId, e.learnerId))
  assert.equal(rows.length, 1)
  assert.ok(Date.parse(rows[0].accessUntil!) > Date.now() + 29 * 864e5)
  assert.equal(rows[0].cohortId, 'k2', 'التجديد في دفعة جديدة ينقله إليها')
})

test('العرض العام يدخل السعر الموثوق عند الطلب', async () => {
  await db.insert(s.courses).values({ id: 'c2', slug: 'c2', title: 'بلا دفعات', status: 'open', price: 200000, previewToken: 'y' })
  await db.insert(s.promotions).values({ id: 'p1', label: 'عرض', scope: 'courses', courseIds: ['c2'], kind: 'percent', value: 25 })
  const q = await m.priceFor('c2', { quantity: 1 })
  assert.equal(q!.q.unit, 150000)
  assert.equal(q!.q.unitList, 200000)
  const off = await m.priceFor('c1', { quantity: 1 })
  assert.equal(off!.q.unit, 100000, 'العرض المقصور على دورة لا يمسّ غيرها')
})
