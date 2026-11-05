/* اختبار تكامل للبيع على قاعدة مؤقتة: الطلب، والإتمام المتكرّر، والكوبون، والمقاعد، والاسترداد. */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'naf-sales-'))
process.env.DATABASE_URL = `file:${join(dir, 't.db')}`
process.env.PAYMENTS_GATEWAY = 'mock'

let m: typeof import('../src/server/sales')
let db: typeof import('../src/server/db')['db']
let s: typeof import('../src/server/db')['schema']
const buyer = { name: 'متدرب', email: 'Buyer@Firm.sa', phone: '0500000000', org: 'شركة', vatNumber: '' }

before(async () => {
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  ;({ db, schema: s } = await import('../src/server/db'))
  await migrate(db, { migrationsFolder: './migrations' })
  m = await import('../src/server/sales')
  const { setSetting, DEFAULT_PAYMENTS } = await import('../src/server/settings')
  await setSetting('payments', { ...DEFAULT_PAYMENTS, enabled: true })
  await db.insert(s.courses).values({ id: 'c1', slug: 'c1', title: 'دورة', status: 'open', price: 100000, seatsTotal: 6, seatsTaken: 1, previewToken: 'x' })
  await db.insert(s.groupRules).values({ id: 'g1', courseId: 'c1', minQty: 3, percent: 10 })
  await db.insert(s.coupons).values({ id: 'k1', code: 'FIRM50', kind: 'percent', value: 50, maxUses: 1, emailDomain: 'firm.sa', stackWithSale: true })
  await db.insert(s.coupons).values({ id: 'k2', code: 'GRANT', kind: 'percent', value: 100 })
})

test('طلب بكوبون نطاق البريد وخصم مجموعة', async () => {
  const r = await m.placeOrder({ slug: 'c1', quantity: 3, code: 'firm50', buyer, attendSelf: true })
  assert.ok(r.ok, !r.ok ? r.error : '')
  if (!r.ok) return
  assert.equal(r.order.total, 135000) // 300000 −10% = 270000 −50%
  assert.equal(r.order.status, 'pending')
  assert.equal(r.order.buyer.email, 'buyer@firm.sa')
  /* السعة: 1 يدوي + 3 معلّقة = 4 من 6 */
  assert.equal(await m.seatsUsed({ id: 'c1', seatsTaken: 1 }), 4)
  const over = await m.placeOrder({ slug: 'c1', quantity: 3, buyer: { ...buyer, email: 'b@x.sa' }, attendSelf: true })
  assert.equal(over.ok, false)

  const id = `mock_${r.order.id}_${r.order.total}_paid`
  const a = await m.confirmPayment(id, r.order.id)
  assert.equal(a.outcome, 'paid')
  const again = await m.confirmPayment(id, r.order.id)
  assert.equal(again.outcome, 'paid')
  const enrolls = await db.select().from(s.enrollments)
  assert.equal(enrolls.length, 1, 'المشتري يأخذ مقعداً واحداً فقط رغم التكرار')
  const grants = await db.select().from(s.seatGrants)
  assert.equal(grants.length, 3)
  assert.equal((await db.select().from(s.couponRedemptions)).length, 1)
  assert.equal((await db.select().from(s.invoices)).length, 1)

  /* الكوبون استُنفد */
  const second = await m.priceFor('c1', { quantity: 1, code: 'FIRM50', email: 'other@firm.sa' })
  assert.match(second!.q.couponError!, /استُنفد/)
})

test('مبلغ لا يطابق الطلب يُرفض', async () => {
  const r = await m.placeOrder({ slug: 'c1', quantity: 1, buyer: { ...buyer, email: 'z@z.sa' }, attendSelf: true })
  assert.ok(r.ok)
  if (!r.ok) return
  const bad = await m.confirmPayment(`mock_${r.order.id}_100_paid`, r.order.id)
  assert.equal(bad.outcome, 'mismatch')
})

test('منحة 100% تكتمل بلا بوابة', async () => {
  const r = await m.placeOrder({ slug: 'c1', quantity: 1, code: 'GRANT', buyer: { ...buyer, email: 'g@g.sa' }, attendSelf: true })
  assert.ok(r.ok && r.free && r.order.status === 'paid' && r.order.method === 'grant')
})

test('استرداد جزئي ثم كامل مع إشعار دائن', async () => {
  const [o] = await db.select().from(s.orders).where((await import('drizzle-orm')).eq(s.orders.couponCode, 'FIRM50'))
  assert.equal((await m.refundOrder(o.id, 999999999, 'x', false, 'admin')).ok, false)
  assert.ok((await m.refundOrder(o.id, 35000, 'جزئي', false, 'admin')).ok)
  assert.ok((await m.refundOrder(o.id, 100000, 'الباقي', true, 'admin')).ok)
  const [after] = await db.select().from(s.orders).where((await import('drizzle-orm')).eq(s.orders.id, o.id))
  assert.equal(after.status, 'refunded')
  const notes = (await db.select().from(s.invoices)).filter((i) => i.kind === 'credit_note')
  assert.equal(notes.length, 2)
  const active = (await db.select().from(s.enrollments)).filter((e) => e.orderId === o.id && e.status === 'active')
  assert.equal(active.length, 0)
})

test('الدفع المطفأ يقفل الطلب المدفوع', async () => {
  const { setSetting, DEFAULT_PAYMENTS } = await import('../src/server/settings')
  await setSetting('payments', { ...DEFAULT_PAYMENTS, enabled: false })
  const r = await m.placeOrder({ slug: 'c1', quantity: 1, buyer: { ...buyer, email: 'q@q.sa' }, attendSelf: true })
  assert.equal(r.ok, false)
})
