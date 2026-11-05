/* الفحص الشامل الثاني — البيع والدفعات: التجديد دائماً ولو أُغلق التسجيل أو امتلأ، والمنتهي لا يشغل مقعداً،
   والطلب الجماعي لمنتهٍ يحضر بنفسه يُتمّ، وتخصيص المقعد يجدّد المنتهي، وعقود المؤسسات تحترم سعة الدفعة. */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'naf-audit2-'))
process.env.DATABASE_URL = `file:${join(dir, 't.db')}`
process.env.PAYMENTS_GATEWAY = 'mock'

let m: typeof import('../src/server/sales')
let db: typeof import('../src/server/db')['db']
let s: typeof import('../src/server/db')['schema']
let eq: typeof import('drizzle-orm')['eq']
const who = (email: string) => ({ name: 'متدرب', email, phone: '', org: '', vatNumber: '' })
const pay = async (o: { id: string; total: number }) => m.confirmPayment(`mock_${o.id}_${o.total}_paid`, o.id)
const past = () => new Date(Date.now() - 864e5).toISOString()
const expire = async (learnerEmail: string, courseId: string) => {
  const [l] = await db.select().from(s.learners).where(eq(s.learners.email, learnerEmail))
  await db.update(s.enrollments).set({ accessUntil: past() }).where(eq(s.enrollments.learnerId, l.id))
  const [e] = await db.select().from(s.enrollments).where(eq(s.enrollments.learnerId, l.id))
  assert.equal(e.courseId, courseId)
  return e
}

before(async () => {
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  ;({ db, schema: s } = await import('../src/server/db'))
  ;({ eq } = await import('drizzle-orm'))
  await migrate(db, { migrationsFolder: './migrations' })
  m = await import('../src/server/sales')
  const { setSetting, DEFAULT_PAYMENTS } = await import('../src/server/settings')
  await setSetting('payments', { ...DEFAULT_PAYMENTS, enabled: true })
  await db.insert(s.courses).values([
    { id: 'c1', slug: 'c1', title: 'دورة بدفعة واحدة', status: 'open', price: 100000, accessDays: 30, previewToken: 'x' },
    { id: 'c2', slug: 'c2', title: 'دورة بلا دفعات', status: 'open', price: 50000, accessDays: 30, seatsTotal: 1, previewToken: 'y' },
  ])
  await db.insert(s.cohorts).values({ id: 'k1', courseId: 'c1', title: 'الأولى', status: 'open', seatsTotal: 1 })
})

test('المنتهي وصوله لا يشغل مقعداً، ويجدّد في دفعته ولو امتلأت وأُغلقت', async () => {
  const a = await m.placeOrder({ slug: 'c1', cohortId: 'k1', quantity: 1, buyer: who('a@x.sa'), attendSelf: true })
  assert.ok(a.ok, !a.ok ? a.error : '')
  if (!a.ok) return
  await pay(a.order)
  /* الدفعة ممتلئة بمقعد «أ» */
  const b = await m.placeOrder({ slug: 'c1', cohortId: 'k1', quantity: 1, buyer: who('b@x.sa'), attendSelf: true })
  assert.equal(b.ok, false)
  const e = await expire('a@x.sa', 'c1')
  /* بعد انتهاء وصول «أ» تحرّر مقعده */
  const { cohortSeatsUsed } = await import('../src/server/cohorts')
  assert.equal(await cohortSeatsUsed({ id: 'k1', seatsTaken: 0 }), 0)
  /* تُغلق الدفعة ويُغلق التسجيل في الدورة — والتجديد يبقى متاحاً بلا اختيار دفعة */
  await db.update(s.cohorts).set({ status: 'closed' }).where(eq(s.cohorts.id, 'k1'))
  await db.update(s.courses).set({ status: 'closed' }).where(eq(s.courses.id, 'c1'))
  const r = await m.placeOrder({ slug: 'c1', quantity: 1, buyer: who('a@x.sa'), attendSelf: true })
  assert.ok(r.ok, !r.ok ? r.error : '')
  if (!r.ok) return
  await pay(r.order)
  const rows = await db.select().from(s.enrollments).where(eq(s.enrollments.learnerId, e.learnerId))
  assert.equal(rows.length, 1)
  assert.equal(rows[0].cohortId, 'k1')
  assert.ok(Date.parse(rows[0].accessUntil!) > Date.now() + 29 * 864e5)
  /* وغير المجدِّد لا يدخل الدورة المغلقة */
  const c = await m.placeOrder({ slug: 'c1', cohortId: 'k1', quantity: 1, buyer: who('c@x.sa'), attendSelf: true })
  assert.equal(c.ok, false)
})

test('طلب جماعي من منتهٍ يحضر بنفسه: يُتمّ ويجدّد تسجيله ويُنشئ بقية المقاعد', async () => {
  await db.update(s.courses).set({ seatsTotal: null }).where(eq(s.courses.id, 'c2'))
  const a = await m.placeOrder({ slug: 'c2', quantity: 1, buyer: who('g@x.sa'), attendSelf: true })
  assert.ok(a.ok)
  if (!a.ok) return
  await pay(a.order)
  const e = await expire('g@x.sa', 'c2')
  const r = await m.placeOrder({ slug: 'c2', quantity: 3, buyer: who('g@x.sa'), attendSelf: true })
  assert.ok(r.ok, !r.ok ? r.error : '')
  if (!r.ok) return
  await pay(r.order)
  const [o] = await db.select().from(s.orders).where(eq(s.orders.id, r.order.id))
  assert.ok(o.fulfilledAt, 'الطلب أُتمّ')
  const grants = await db.select().from(s.seatGrants).where(eq(s.seatGrants.orderId, r.order.id))
  assert.equal(grants.length, 3)
  assert.equal(grants.filter((g) => g.enrollmentId === e.id).length, 1)
  const [again] = await db.select().from(s.enrollments).where(eq(s.enrollments.id, e.id))
  assert.ok(Date.parse(again.accessUntil!) > Date.now())
})

test('تخصيص مقعد لمنتهٍ يجدّد تسجيله بدل الرفض', async () => {
  const [r] = await db.select().from(s.orders).where(eq(s.orders.createdBy, 'web')).orderBy((await import('drizzle-orm')).desc(s.orders.createdAt))
  const free = (await db.select().from(s.seatGrants).where(eq(s.seatGrants.orderId, r.id))).filter((g) => !g.enrollmentId)
  const { assignSeatCore } = await import('../src/server/seats')
  const first = await assignSeatCore(free[0].id, 'h@x.sa', 'حاضر', 'test')
  assert.ok(first.ok, first.error)
  await expire('h@x.sa', 'c2')
  const again = await assignSeatCore(free[1].id, 'h@x.sa', 'حاضر', 'test')
  assert.ok(again.ok, again.error)
  const [l] = await db.select().from(s.learners).where(eq(s.learners.email, 'h@x.sa'))
  const rows = await db.select().from(s.enrollments).where(eq(s.enrollments.learnerId, l.id))
  assert.equal(rows.length, 1)
  assert.ok(Date.parse(rows[0].accessUntil!) > Date.now())
})

test('عقد المؤسسة لا يتجاوز سعة الدفعة', async () => {
  await db.update(s.cohorts).set({ status: 'open' }).where(eq(s.cohorts.id, 'k1'))
  await db.insert(s.organizations).values({ id: 'o1', name: 'جهة' })
  await db.insert(s.orgContracts).values({ id: 'ct1', orgId: 'o1', number: 'CT-1', title: 'عقد', seats: 10, scope: 'all', courseIds: [], status: 'active' })
  const { assignContractSeat } = await import('../src/server/contracts')
  /* الدفعة سعتها 1 ومشغولة بالمجدِّد «أ» */
  const r = await assignContractSeat('ct1', { email: 'z@x.sa', name: 'موظف', courseId: 'c1', cohortId: 'k1' }, 'test')
  assert.equal(r.ok, false)
  assert.match(r.error ?? '', /اكتملت|تكفي/)
})
