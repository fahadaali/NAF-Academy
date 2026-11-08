/* وافق — الدوال النقية: الأجسام والمبالغ والجهات والتراجع والأخطاء. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { amountMatches, contactBody, contactKey, creditNoteBody, DEFAULT_WAFEQ, invoiceBody, missingSettings, nextAttemptAt, paymentBody, riyadhDate, riyal, wafeqError, WAFEQ_BACKOFF_MIN } from '../src/lib/wafeq'

const cfg = { ...DEFAULT_WAFEQ, enabled: true, revenueAccount: 'acc_rev', discountAccount: 'acc_disc', taxRate: 'tax_std' }
const inv = {
  id: 'i1', number: 'INV-000123', kind: 'invoice' as const, issuedAt: '2026-11-08T22:30:00.000Z', total: 628200,
  lines: [{ title: 'صياغة العقو~3د — المميزة', quantity: 2, unit: 349000, total: 698000 }, { title: 'خصم الكوبون NAF10', quantity: 1, unit: -69800, total: -69800 }],
}

test('الفاتورة: شاملة الضريبة بالريال، والخصم في discount_amount، والرقم نفسه', () => {
  const b = invoiceBody(inv, cfg, 'cnt_1', 'NA-2026-000123')
  assert.equal(b.tax_amount_type, 'TAX_INCLUSIVE')
  assert.equal(b.currency, 'SAR')
  assert.equal(b.status, 'DRAFT', 'مسودة حتى يُطابق الإجمالي')
  assert.equal(b.invoice_number, 'INV-000123')
  assert.equal(b.external_id, 'i1')
  assert.equal(b.reference, 'NA-2026-000123')
  assert.equal(b.line_items.length, 1, 'لا أسطر سالبة')
  assert.deepEqual(b.line_items[0], { account: 'acc_rev', description: 'صياغة العقود — المميزة', quantity: 2, unit_amount: 3490, tax_rate: 'tax_std', order: 1 })
  assert.equal(b.discount_amount, 698)
  assert.equal(b.discount_account, 'acc_disc')
  assert.equal(b.discount_tax_rate, 'tax_std')
  /* 22:30 بتوقيت غرينتش = 01:30 من اليوم التالي في الرياض */
  assert.equal(b.invoice_date, '2026-11-09')
  assert.equal(b.invoice_due_date, '2026-11-09')
  const plain = invoiceBody({ ...inv, lines: [inv.lines[0]] }, { ...cfg, discountAccount: '' }, 'c', 'o')
  assert.equal('discount_amount' in plain, false)
})

test('الإشعار الدائن يشير إلى الفاتورة، والدفعة قبض أو صرف', () => {
  const cn = creditNoteBody({ id: 'c1', number: 'CN-000004', kind: 'credit_note', issuedAt: '2026-11-08T10:00:00Z', total: 35000, lines: [{ title: 'استرداد — الطلب X', quantity: 1, unit: 35000, total: 35000 }] }, cfg, 'cnt_1', 'INV-000123')
  assert.equal(cn.credit_note_number, 'CN-000004')
  assert.equal(cn.reference, 'INV-000123')
  assert.equal(cn.line_items[0].unit_amount, 350)
  const pin = paymentBody({ kind: 'invoice', docId: 'inv_9', amount: 628200, date: '2026-11-08T10:00:00Z', account: 'acc_bank', contact: 'cnt_1', reference: 'pay_x', externalId: 'pay:i1' })
  assert.equal(pin.amount, 6282)
  assert.deepEqual((pin as Record<string, unknown>).invoice_payments, [{ amount: 6282, amount_to_pcy: 6282, invoice: 'inv_9' }])
  assert.equal('credit_note_payments' in pin, false)
  const pout = paymentBody({ kind: 'credit_note', docId: 'cn_9', amount: 35000, date: '2026-11-08T10:00:00Z', account: 'acc_bank', contact: 'cnt_1', reference: 'r', externalId: 'pay:c1' })
  assert.deepEqual((pout as Record<string, unknown>).credit_note_payments, [{ amount: 350, amount_to_pcy: 350, credit_note: 'cn_9' }])
})

test('جهة الاتصال: المنشأة برقمها الضريبي، والفرد ببريده', () => {
  const person = { name: 'سارة', email: ' Sara@X.sa ', phone: '0500000000', org: '', vatNumber: '' }
  assert.equal(contactKey(person), 'email:sara@x.sa')
  const p = contactBody(person)
  assert.equal(p.party_type, 'individual'); assert.equal(p.name, 'سارة'); assert.equal(p.email, 'sara@x.sa'); assert.equal('tax_registration_number' in p, false)
  const firm = { name: 'سارة', email: 's@firm.sa', org: 'شركة المثال', vatNumber: '300000000000003' }
  assert.equal(contactKey(firm), 'vat:300000000000003')
  const f = contactBody(firm)
  assert.equal(f.party_type, 'business'); assert.equal(f.name, 'شركة المثال'); assert.equal(f.tax_registration_number, '300000000000003')
})

test('المبالغ والتواريخ والإعداد والتراجع', () => {
  assert.equal(riyal(12345), 123.45)
  assert.ok(amountMatches(6282, 628200)); assert.ok(amountMatches(0.1 + 0.2, 30)); assert.ok(!amountMatches(6282.01, 628200)); assert.ok(!amountMatches('6282', 628200))
  assert.equal(riyadhDate('2026-01-01T20:59:59Z'), '2026-01-01')
  assert.equal(riyadhDate('2026-01-01T21:00:00Z'), '2026-01-02')
  assert.deepEqual(missingSettings(DEFAULT_WAFEQ), ['حساب الإيراد', 'نسبة الضريبة'])
  assert.deepEqual(missingSettings(cfg), [])
  const now = new Date('2026-11-08T00:00:00Z')
  assert.equal(nextAttemptAt(0, now), new Date(now.getTime() + WAFEQ_BACKOFF_MIN[0] * 60e3).toISOString())
  assert.equal(nextAttemptAt(WAFEQ_BACKOFF_MIN.length, now), null)
})

test('خطأ وافق مقروء', () => {
  assert.equal(wafeqError(400, { line_items: [{ tax_rate: ['غير صالح'] }] }), 'وافق 400: line_items.tax_rate: غير صالح')
  assert.equal(wafeqError(401, { detail: 'Invalid API key' }), 'وافق 401: Invalid API key')
  assert.equal(wafeqError(502, null), 'وافق 502')
})
