/* وافق — تكامل على قاعدة مؤقتة ومحاكاة API: الدفع ← فاتورة معتمدة مُبلَّغة بدفعتها وملفها، والاستئناف بلا تكرار،
   والاسترداد ← إشعار دائن وصرف، والربط المقفل لا يتصل، والإجمالي المخالف لا يُعتمد. */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { and, eq } from 'drizzle-orm'

const dir = mkdtempSync(join(tmpdir(), 'naf-wafeq-'))
process.env.DATABASE_URL = `file:${join(dir, 't.db')}`
process.env.PAYMENTS_GATEWAY = 'mock'
process.env.WAFEQ_MOCK = '1'

let m: typeof import('../src/server/sales')
let w: typeof import('../src/server/wafeq/sync')
let c: typeof import('../src/server/wafeq/client')
let db: typeof import('../src/server/db')['db']
let s: typeof import('../src/server/db')['schema']
let setSetting: typeof import('../src/server/settings')['setSetting']
const cfg = { enabled: true, reportToTax: true, revenueAccount: 'acc_rev', discountAccount: 'acc_disc', taxRate: 'tax_std', paidThrough: { gateway: 'acc_moyasar', bank_transfer: '', cash: '' }, language: 'ar' }
let n = 0
const buyer = () => ({ name: 'متدرب', email: `b${++n}@firm.sa`, phone: '0500000000', org: 'شركة', vatNumber: '' })

async function paidOrder(code?: string) {
  const r = await m.placeOrder({ slug: 'c1', quantity: 1, code, buyer: buyer(), attendSelf: true })
  assert.ok(r.ok, !r.ok ? r.error : '')
  if (!r.ok) throw new Error()
  assert.equal((await m.confirmPayment(`mock_${r.order.id}_${r.order.total}_paid`, r.order.id)).outcome, 'paid')
  const [inv] = await db.select().from(s.invoices).where(eq(s.invoices.orderId, r.order.id))
  return { order: r.order, inv }
}

before(async () => {
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  ;({ db, schema: s } = await import('../src/server/db'))
  await migrate(db, { migrationsFolder: './migrations' })
  m = await import('../src/server/sales')
  w = await import('../src/server/wafeq/sync')
  c = await import('../src/server/wafeq/client')
  const st = await import('../src/server/settings')
  setSetting = st.setSetting
  await setSetting('payments', { ...st.DEFAULT_PAYMENTS, enabled: true })
  await setSetting('wafeq', cfg)
  await db.insert(s.courses).values({ id: 'c1', slug: 'c1', title: 'دورة', status: 'open', price: 100000, seatsTotal: 100, seatsTaken: 0, previewToken: 'x' })
  await db.insert(s.coupons).values({ id: 'k1', code: 'HALF', kind: 'percent', value: 50 })
})

test('الدفع ← فاتورة معتمدة في وافق، مُبلَّغة، بدفعتها وملفها', async () => {
  const st = c.mockStore()
  const { order, inv } = await paidOrder('HALF')
  assert.equal(inv.wafeqStatus, 'done', inv.wafeqError)
  assert.equal(inv.wafeqStep, 'done')
  const doc = st.invoices.find((d) => d.id === inv.wafeqId)!
  assert.equal(doc.status, 'FINALIZED')
  assert.equal(doc.invoice_number, inv.number)
  assert.equal(Math.round(doc.amount * 100), order.total)
  assert.equal(doc.discount_amount, 500, 'خصم الكوبون في discount_amount')
  assert.ok(st.reports.includes(doc.id), 'أُبلغت للهيئة')
  assert.equal(inv.wafeqTax, 'REPORTED')
  const pay = st.payments.find((p) => p.id === inv.wafeqPaymentId)!
  assert.equal(pay.paid_through_account, 'acc_moyasar')
  assert.deepEqual(pay.invoice_payments, [{ amount: 500, amount_to_pcy: 500, invoice: doc.id }])
  const { officialFile } = await import('../src/server/invoices')
  const f = await officialFile(inv, { orderNumber: order.number, vatRate: order.vatRate })
  assert.equal(f.source, 'wafeq'); assert.equal(f.wait, false)
  assert.equal(Buffer.from(f.bytes.subarray(0, 5)).toString(), '%PDF-')
})

test('فشل عابر في منتصف الخطوات ← يُستأنف من خطوته بلا تكرار', async () => {
  const st = c.mockStore()
  st.fail['POST /payments/'] = 1
  const before = { inv: st.invoices.length, pay: st.payments.length, contacts: st.contacts.length }
  const { inv, order } = await paidOrder()
  assert.equal(inv.wafeqStatus, 'pending')
  assert.equal(inv.wafeqStep, 'payment')
  assert.equal(inv.wafeqAttempts, 1)
  assert.match(inv.wafeqError, /503/)
  /* البريد ينتظر الرسمية ما دامت المزامنة جارية */
  const { officialFile } = await import('../src/server/invoices')
  assert.equal((await officialFile(inv, { orderNumber: order.number, vatRate: 15 })).wait, true)
  const r = await w.retryWafeq(new Date(Date.now() + 3600e3))
  assert.equal(r.done, 1)
  const [after] = await db.select().from(s.invoices).where(eq(s.invoices.id, inv.id))
  assert.equal(after.wafeqStatus, 'done')
  assert.equal(st.invoices.length, before.inv + 1, 'فاتورة واحدة')
  assert.equal(st.payments.length, before.pay + 1, 'دفعة واحدة')
  assert.equal(st.contacts.length, before.contacts + 1)
})

test('الاسترداد ← إشعار دائن مُبلَّغ وصرف على حساب البوابة', async () => {
  const st = c.mockStore()
  const { order, inv } = await paidOrder()
  const r = await m.refundOrder(order.id, 40000, 'اعتذار', false, 'admin')
  assert.ok(r.ok, r.error ?? '')
  const cns = await db.select().from(s.invoices).where(and(eq(s.invoices.kind, 'credit_note'), eq(s.invoices.orderId, order.id)))
  assert.equal(cns.length, 1)
  const cn = cns[0]
  assert.equal(cn.wafeqStatus, 'done', cn.wafeqError)
  assert.equal(cn.wafeqContactId, inv.wafeqContactId, 'جهة الفاتورة نفسها')
  const doc = st['credit-notes'].find((d) => d.id === cn.wafeqId)!
  assert.equal(doc.status, 'FINALIZED'); assert.equal(doc.reference, inv.number); assert.equal(doc.amount, 400)
  assert.ok(st.reports.includes(doc.id))
  const pay = st.payments.find((p) => p.id === cn.wafeqPaymentId)!
  assert.deepEqual(pay.credit_note_payments, [{ amount: 400, amount_to_pcy: 400, credit_note: doc.id }])
})

test('إجمالي وافق يخالف الطلب ← لا اعتماد، ويُوسم «فشل» للمراجعة', async () => {
  const g = globalThis as { __wafeqFetch?: (u: string, i: RequestInit) => Promise<Response> }
  g.__wafeqFetch = async (u, i) => {
    const r = await c.mockFetch(u, i)
    if (i.method === 'POST' && u.endsWith('/invoices/')) { const d = await r.json(); d.amount += 1; c.mockStore().invoices.at(-1)!.amount = d.amount; return Response.json(d, { status: 201 }) }
    return r
  }
  try {
    const { inv } = await paidOrder()
    assert.equal(inv.wafeqStatus, 'failed')
    assert.match(inv.wafeqError, /لا يطابق/)
    const doc = c.mockStore().invoices.find((d) => d.external_id === inv.id)!
    assert.equal(doc.status, 'DRAFT', 'بقيت مسودة')
    const log = await db.select().from(s.auditLog).where(eq(s.auditLog.action, 'needs_attention'))
    assert.ok(log.some((x) => x.summary.includes(inv.number)))
  } finally { delete g.__wafeqFetch }
})

test('الربط المقفل ← لا اتصال، والملف المحلي بلا انتظار', async () => {
  await setSetting('wafeq', { ...cfg, enabled: false })
  const st = c.mockStore()
  const count = st.invoices.length
  const { inv, order } = await paidOrder()
  assert.equal(inv.wafeqStatus, 'off')
  assert.equal(st.invoices.length, count)
  const { officialFile } = await import('../src/server/invoices')
  const f = await officialFile(inv, { orderNumber: order.number, vatRate: 15 })
  assert.equal(f.source, 'local'); assert.equal(f.wait, false)
  /* وبعد التفعيل: إعادة المزامنة من اللوحة ترسل ما صدر قبل الربط */
  await setSetting('wafeq', cfg)
  assert.equal(await w.resyncInvoice(inv.id), 'done')
  assert.equal(st.invoices.length, count + 1)
})
