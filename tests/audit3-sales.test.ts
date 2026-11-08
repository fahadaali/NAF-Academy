/* الفحص الثالث — مسارات المال: الدفعة المقبوضة تنتهي دافعةً أو مستردّة (لا ثالث)، والاسترداد التلقائي لا يتكرّر
   ويُعاد إن فشل، والتنفيذ المنقطع يُستأنف دورياً، والمجاني مقعد واحد، والتجديد لا يفتح المغلق لفريق، وQR الإشعار الدائن موجب. */
import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'naf-audit3-'))
process.env.DATABASE_URL = `file:${join(dir, 't.db')}`
process.env.PAYMENTS_GATEWAY = 'mock'

let m: typeof import('../src/server/sales')
let db: typeof import('../src/server/db')['db']
let s: typeof import('../src/server/db')['schema']
let eq: typeof import('drizzle-orm')['eq']
let mock: typeof import('../src/server/payments/mock')['mockControl']
const who = (email: string) => ({ name: 'متدرب', email, phone: '', org: '', vatNumber: '' })
const pid = (o: { id: string; total: number }, st: 'paid' | 'initiated' = 'paid') => `mock_${o.id}_${o.total}_${st}`
const paymentRow = async (gid: string) => (await db.select().from(s.payments).where(eq(s.payments.gatewayId, gid)))[0]
const orderRow = async (id: string) => (await db.select().from(s.orders).where(eq(s.orders.id, id)))[0]
const refundsOf = (gid: string) => mock.refunds.filter((r) => r.paymentId === gid).length

async function place(slug: string, email: string, extra: Partial<Parameters<typeof m.placeOrder>[0]> = {}) {
  const r = await m.placeOrder({ slug, quantity: 1, buyer: who(email), attendSelf: true, ...extra })
  assert.ok(r.ok, !r.ok ? r.error : '')
  if (!r.ok) throw new Error(r.error)
  return r.order
}

before(async () => {
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  ;({ db, schema: s } = await import('../src/server/db'))
  ;({ eq } = await import('drizzle-orm'))
  await migrate(db, { migrationsFolder: './migrations' })
  m = await import('../src/server/sales')
  ;({ mockControl: mock } = await import('../src/server/payments/mock'))
  const { setSetting, DEFAULT_PAYMENTS } = await import('../src/server/settings')
  await setSetting('payments', { ...DEFAULT_PAYMENTS, enabled: true })
  await db.insert(s.courses).values([
    { id: 'p1', slug: 'p1', title: 'دورة مدفوعة', status: 'open', price: 40000, previewToken: 'a' },
    { id: 'f1', slug: 'f1', title: 'دورة مجانية', status: 'open', price: 0, free: true, previewToken: 'b' },
    { id: 'r1', slug: 'r1', title: 'دورة للتجديد', status: 'open', price: 30000, accessDays: 30, previewToken: 'c' },
    { id: 'v1', slug: 'v1', title: 'برنامج خاص', status: 'open', price: 0, visibility: 'private', previewToken: 'd' },
  ])
  await db.insert(s.coupons).values({ id: 'z100', code: 'ALLFREE', kind: 'percent', value: 100, stackWithSale: true })
})

beforeEach(() => { mock.refundFailures = 0; mock.status.clear() })

test('دفعة لطلب أُلغي (استُبدل بطلب أحدث) تُسترد مرة واحدة مهما أُعيد الإشعار', async () => {
  const a = await place('p1', 'race@x.sa')
  /* طلب أحدث للمشتري نفسه يلغي «أ» بين فتح نموذج الدفع وعودة الدفعة */
  const b = await place('p1', 'race@x.sa')
  assert.equal((await orderRow(a.id)).status, 'canceled')
  const r1 = await m.confirmPayment(pid(a), a.id)
  assert.equal(r1.outcome, 'mismatch')
  assert.equal(refundsOf(pid(a)), 1)
  assert.equal((await paymentRow(pid(a))).status, m.ORPHAN.refunded)
  /* إعادة الـWebhook وعودة المتصفح لا تستردان ثانية، والحالة اللاحقة من البوابة لا تمحو العلامة */
  await m.confirmPayment(pid(a), a.id)
  await m.confirmPayment(pid(a))
  assert.equal(refundsOf(pid(a)), 1)
  assert.equal((await paymentRow(pid(a))).status, m.ORPHAN.refunded)
  /* الطلب الأحدث يُدفع عادياً */
  assert.equal((await m.confirmPayment(pid(b), b.id)).outcome, 'paid')
  assert.equal(refundsOf(pid(b)), 0)
})

test('دفعة سُجّلت معلّقة ثم قُبضت بعد الإلغاء تُسترد (لا تُعفى لأنها «رُئيت من قبل»)', async () => {
  const o = await place('p1', 'late@x.sa')
  const id = pid(o, 'initiated')
  assert.equal((await m.confirmPayment(id, o.id)).outcome, 'unknown')
  await db.update(s.orders).set({ status: 'canceled' }).where(eq(s.orders.id, o.id))
  mock.status.set(id, 'paid')
  assert.equal((await m.confirmPayment(id, o.id)).outcome, 'mismatch')
  assert.equal(refundsOf(id), 1)
})

test('دفعتان معاً لطلب واحد: واحدة تدفع والأخرى تُسترد — لا دفعة مقبوضة بلا تسجيل', async () => {
  const o = await place('p1', 'twice@x.sa')
  const first = pid(o)
  const second = pid(o, 'initiated')
  mock.status.set(second, 'paid')
  const res = await Promise.all([m.confirmPayment(first, o.id), m.confirmPayment(second, o.id)])
  assert.ok(res.every((r) => r.outcome === 'paid'))
  const fresh = await orderRow(o.id)
  assert.equal(fresh.status, 'paid')
  const loser = fresh.gatewayPaymentId === first ? second : first
  assert.equal(refundsOf(fresh.gatewayPaymentId!), 0)
  assert.equal(refundsOf(loser), 1)
  assert.equal((await db.select().from(s.enrollments).where(eq(s.enrollments.orderId, o.id))).length, 1)
  /* وإعادة كليهما لا تغيّر شيئاً */
  await m.confirmPayment(first, o.id)
  await m.confirmPayment(second, o.id)
  assert.equal(refundsOf(loser), 1)
  assert.equal(refundsOf(fresh.gatewayPaymentId!), 0)
})

test('الاسترداد الفاشل يُعلَّم ويُعاد من المشغّل بتراجع، ولا يُسترد مرتين', async () => {
  const o = await place('p1', 'fail@x.sa')
  await db.update(s.orders).set({ status: 'canceled' }).where(eq(s.orders.id, o.id))
  mock.refundFailures = 1
  await m.confirmPayment(pid(o), o.id)
  assert.equal(refundsOf(pid(o)), 0)
  assert.equal((await paymentRow(pid(o))).status, m.ORPHAN.failed)
  /* إعادة الإشعار لا تستدعي البوابة — الإعادة للمشغّل وحده */
  await m.confirmPayment(pid(o), o.id)
  assert.equal(refundsOf(pid(o)), 0)
  /* قبل انقضاء التراجع: ينتظر */
  const early = await m.retryOrphanRefunds(new Date())
  assert.equal(early.refunded, 0)
  assert.equal(refundsOf(pid(o)), 0)
  const later = new Date(Date.now() + 11 * 60e3)
  const r = await m.retryOrphanRefunds(later)
  assert.equal(r.refunded, 1)
  assert.equal(refundsOf(pid(o)), 1)
  assert.equal((await paymentRow(pid(o))).status, m.ORPHAN.refunded)
  await m.retryOrphanRefunds(new Date(Date.now() + 24 * 3600e3))
  await m.confirmPayment(pid(o), o.id)
  assert.equal(refundsOf(pid(o)), 1)
})

test('الاسترداد يتحوّل إلى يدوي بعد سقف المحاولات', async () => {
  const o = await place('p1', 'stuck@x.sa')
  await db.update(s.orders).set({ status: 'canceled' }).where(eq(s.orders.id, o.id))
  mock.refundFailures = 100
  await m.confirmPayment(pid(o), o.id)
  for (let i = 1; i < m.ORPHAN_MAX_ATTEMPTS; i++) await m.retryOrphanRefunds(new Date(Date.now() + i * 7 * 3600e3))
  assert.equal((await paymentRow(pid(o))).status, m.ORPHAN.stuck)
  await m.retryOrphanRefunds(new Date(Date.now() + 99 * 3600e3))
  assert.equal(refundsOf(pid(o)), 0)
  const log = await db.select().from(s.auditLog).where(eq(s.auditLog.entityId, o.id))
  assert.ok(log.some((l) => l.action === 'needs_attention' && /يدوياً/.test(l.summary)))
})

test('المشغّل يستأنف التنفيذ المنقطع (مدفوع بلا تسجيل) ويتجاهل الجاري حديثاً', async () => {
  const o = await place('p1', 'sweep@x.sa')
  await m.confirmPayment(pid(o), o.id)
  await db.delete(s.enrollments).where(eq(s.enrollments.orderId, o.id))
  const old = new Date(Date.now() - 10 * 60e3).toISOString()
  /* مطالبة تنفيذ عالقة منذ عشر دقائق */
  await db.update(s.orders).set({ fulfilledAt: null, fulfillingAt: old, paidAt: old }).where(eq(s.orders.id, o.id))
  /* وطلب مجاني مدفوع لم يُنفَّذ قط (لا Webhook يعيده) */
  const f = await place('f1', 'free-sweep@x.sa')
  await db.delete(s.enrollments).where(eq(s.enrollments.orderId, f.id))
  await db.update(s.orders).set({ fulfilledAt: null, fulfillingAt: null, paidAt: old }).where(eq(s.orders.id, f.id))
  /* ومطالبة جارية الآن لا تُزاحَم */
  const g = await place('p1', 'busy@x.sa')
  await m.confirmPayment(pid(g), g.id)
  await db.update(s.orders).set({ fulfilledAt: null, fulfillingAt: new Date().toISOString(), paidAt: old }).where(eq(s.orders.id, g.id))

  const n = await m.resumeFulfillment(new Date())
  assert.equal(n, 2)
  assert.equal((await db.select().from(s.enrollments).where(eq(s.enrollments.orderId, o.id))).length, 1)
  assert.equal((await db.select().from(s.enrollments).where(eq(s.enrollments.orderId, f.id))).length, 1)
  assert.ok((await orderRow(o.id)).fulfilledAt)
  assert.equal((await orderRow(g.id)).fulfilledAt, null)
  assert.equal((await db.select().from(s.invoices).where(eq(s.invoices.orderId, o.id))).length, 1)
  assert.equal(await m.resumeFulfillment(new Date()), 0)
})

test('الطلب المجاني مقعد واحد للزائر: دورة مجانية وكوبون 100%، والموظف مستثنى', async () => {
  const many = await m.placeOrder({ slug: 'f1', quantity: 5, buyer: who('team@x.sa'), attendSelf: false })
  assert.equal(many.ok, false)
  assert.match(!many.ok ? many.error : '', /مقعد واحد/)
  const coupon = await m.placeOrder({ slug: 'p1', quantity: 3, code: 'ALLFREE', buyer: who('team2@x.sa'), attendSelf: true })
  assert.equal(coupon.ok, false)
  const one = await m.placeOrder({ slug: 'p1', quantity: 1, code: 'ALLFREE', buyer: who('team3@x.sa'), attendSelf: true })
  assert.ok(one.ok && one.free)
  const staff = await m.placeOrder({ slug: 'f1', quantity: 4, buyer: who('hr@x.sa'), attendSelf: false, method: 'grant', by: 'مدير' })
  assert.ok(staff.ok, !staff.ok ? staff.error : '')
})

test('التجديد يتخطى «التسجيل مغلق» لمقعده وحده — لا لمقاعد فريق إضافية', async () => {
  const o = await place('r1', 'renew@x.sa')
  await m.confirmPayment(pid(o), o.id)
  const [l] = await db.select().from(s.learners).where(eq(s.learners.email, 'renew@x.sa'))
  await db.update(s.enrollments).set({ accessUntil: new Date(Date.now() - 864e5).toISOString() }).where(eq(s.enrollments.learnerId, l.id))
  await db.update(s.courses).set({ status: 'closed' }).where(eq(s.courses.id, 'r1'))
  const team = await m.placeOrder({ slug: 'r1', quantity: 4, buyer: who('renew@x.sa'), attendSelf: true })
  assert.equal(team.ok, false)
  const self = await m.placeOrder({ slug: 'r1', quantity: 1, buyer: who('renew@x.sa'), attendSelf: true })
  assert.ok(self.ok, !self.ok ? self.error : '')
  await db.update(s.courses).set({ status: 'open' }).where(eq(s.courses.id, 'r1'))
})

test('استرداد الطلب الأصلي بإلغاء التسجيل يلغي تسجيلاً جُدّد بعده بلا مقابل، ويُبقي التجديد المدفوع', async () => {
  /* «أ»: اشترى ثم انتهى وصوله فجدّد بكوبون 100% — التسجيل صار على طلب التجديد */
  const a = await place('r1', 'orig-a@x.sa')
  await m.confirmPayment(pid(a), a.id)
  const [la] = await db.select().from(s.learners).where(eq(s.learners.email, 'orig-a@x.sa'))
  await db.update(s.enrollments).set({ accessUntil: new Date(Date.now() - 864e5).toISOString() }).where(eq(s.enrollments.learnerId, la.id))
  const freeRenew = await place('r1', 'orig-a@x.sa', { code: 'ALLFREE' })
  const [ea] = await db.select().from(s.enrollments).where(eq(s.enrollments.learnerId, la.id))
  assert.equal(ea.orderId, freeRenew.id)
  assert.ok((await m.refundOrder(a.id, a.total, 'استرداد', true, 'admin')).ok)
  assert.equal((await db.select().from(s.enrollments).where(eq(s.enrollments.id, ea.id)))[0].status, 'canceled')

  /* «ب»: جدّد بدفعة — وصول التجديد قائم بذاته */
  const b = await place('r1', 'orig-b@x.sa')
  await m.confirmPayment(pid(b), b.id)
  const [lb] = await db.select().from(s.learners).where(eq(s.learners.email, 'orig-b@x.sa'))
  await db.update(s.enrollments).set({ accessUntil: new Date(Date.now() - 864e5).toISOString() }).where(eq(s.enrollments.learnerId, lb.id))
  const paidRenew = await place('r1', 'orig-b@x.sa')
  await m.confirmPayment(pid(paidRenew), paidRenew.id)
  assert.ok((await m.refundOrder(b.id, b.total, 'استرداد', true, 'admin')).ok)
  const [eb] = await db.select().from(s.enrollments).where(eq(s.enrollments.learnerId, lb.id))
  assert.equal(eb.status, 'active')
})

test('QR الإشعار الدائن بمبالغ موجبة', async () => {
  const o = await place('p1', 'qr@x.sa')
  await m.confirmPayment(pid(o), o.id)
  assert.ok((await m.refundOrder(o.id, 10000, 'جزئي', false, 'admin')).ok)
  const [cn] = (await db.select().from(s.invoices).where(eq(s.invoices.orderId, o.id))).filter((i) => i.kind === 'credit_note')
  const raw = Buffer.from(cn.qr, 'base64')
  const fields: string[] = []
  for (let i = 0; i < raw.length;) { const len = raw[i + 1]; fields.push(raw.subarray(i + 2, i + 2 + len).toString('utf8')); i += 2 + len }
  assert.equal(fields[3], '100.00')
  assert.ok(!fields[4].startsWith('-'))
  assert.ok(Number(fields[4]) > 0)
})

test('عقد نطاقه «كل الدورات» لا يشمل البرنامج الخاص؛ والنطاق الصريح يشمله', async () => {
  await db.insert(s.organizations).values({ id: 'o3', name: 'جهة' })
  await db.insert(s.orgContracts).values([
    { id: 'ca', orgId: 'o3', number: 'CT-A', title: 'عقد عام', seats: 5, scope: 'all', courseIds: [], status: 'active' },
    { id: 'cb', orgId: 'o3', number: 'CT-B', title: 'عقد البرنامج', seats: 5, scope: 'courses', courseIds: ['v1'], status: 'active' },
  ])
  const { assignContractSeat } = await import('../src/server/contracts')
  const no = await assignContractSeat('ca', { email: 'emp@x.sa', name: 'موظف', courseId: 'v1' }, 'test')
  assert.equal(no.ok, false)
  const yes = await assignContractSeat('cb', { email: 'emp@x.sa', name: 'موظف', courseId: 'v1' }, 'test')
  assert.ok(yes.ok, yes.error ?? '')
})
