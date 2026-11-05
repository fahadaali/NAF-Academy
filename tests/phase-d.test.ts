/* المرحلة د: توقيع أحداث البريد، وفاتورة PDF، والشهادة الثنائية PDF */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mailEvent, svixSign, verifySvix } from '../src/lib/svix'

test('توقيع Svix: يُقبل الصحيح بين عدة توقيعات، ويُرفض المعدّل والقديم', () => {
  const secret = `whsec_${Buffer.from('k'.repeat(24)).toString('base64')}`
  const ts = String(Math.floor(Date.now() / 1000))
  const body = '{"type":"email.opened"}'
  const sig = svixSign(secret, 'msg_1', ts, body)
  assert.equal(verifySvix(secret, { id: 'msg_1', ts, sig: `v1,bogus v1,${sig}` }, body), true)
  assert.equal(verifySvix(secret, { id: 'msg_1', ts, sig: `v1,${sig}` }, body + ' '), false)
  assert.equal(verifySvix(secret, { id: 'msg_2', ts, sig: `v1,${sig}` }, body), false)
  assert.equal(verifySvix(secret, { id: 'msg_1', ts: String(Number(ts) - 3600), sig: `v1,${sig}` }, body), false)
  assert.equal(mailEvent('email.bounced', 'Transient'), null, 'الارتداد المؤقت لا يُكتم')
  assert.equal(mailEvent('email.bounced', 'Permanent'), 'bounced')
  assert.equal(mailEvent('email.sent'), null)
})

const dir = mkdtempSync(join(tmpdir(), 'naf-docs-'))
process.env.DATABASE_URL = `file:${join(dir, 't.db')}`
let db: typeof import('../src/server/db')['db']
let s: typeof import('../src/server/db')['schema']

before(async () => {
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  ;({ db, schema: s } = await import('../src/server/db'))
  await migrate(db, { migrationsFolder: './migrations' })
})

test('فاتورة PDF تُولَّد من الفاتورة المخزّنة', async () => {
  const { invoicePdf } = await import('../src/server/invoices/pdf')
  const inv = {
    id: 'i1', number: 'INV-2026-000001', kind: 'invoice' as const, orderId: 'o1', refOf: null,
    seller: { name: 'شركة ناف القانونية', vatNumber: '300000000000003', crNumber: '1010', address: 'الرياض' },
    buyer: { name: 'سارة', email: 's@x.sa', org: 'منشأة', vatNumber: '' },
    lines: [{ title: 'صياغة العقود — المميزة', quantity: 2, unit: 349000, total: 698000 }, { title: 'خصم الكوبون NAF10', quantity: 1, unit: -69800, total: -69800 }],
    total: 628200, vat: 81939, qr: Buffer.from('tlv').toString('base64'), issuedAt: new Date().toISOString(),
  }
  const bytes = await invoicePdf(inv, { orderNumber: 'NA-2026-000123', vatRate: 15 })
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-')
  assert.ok(bytes.length > 2000)
})

test('الشهادة الثنائية: الوجه الإنجليزي يزيد الملف ولا يكسره', async () => {
  const { certificatePdf } = await import('../src/server/certificates/pdf')
  const { DEFAULT_DESIGN } = await import('../src/lib/certificate')
  const data = { name: 'سارة عبدالله', course: 'نظام الإثبات', hours: 12, date: '5 نوفمبر 2026', hijri: '14 جمادى الأولى 1448', code: 'NAF-AAAA-BBBB', verifyUrl: 'https://x/c', nameEn: 'Sarah Abdullah', courseEn: 'Evidence Law', dateEn: '5 November 2026' }
  const brand = { name: 'أكاديمية ناف', tagline: '', companyName: '', showName: true, logo: null, full: false }
  const ar = await certificatePdf(DEFAULT_DESIGN, data, brand)
  const bi = await certificatePdf({ ...DEFAULT_DESIGN, bilingual: true }, data, brand)
  assert.equal(Buffer.from(bi.slice(0, 5)).toString(), '%PDF-')
  assert.ok(bi.length > ar.length, 'سطور إنجليزية إضافية')
})
