/* المرحلة ب: الكتل والتنسيق الآمن، وصلاحيات الأعضاء المخصّصة، ومقاعد العقود (قاعدة مؤقتة) */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { blocksFrom, blocksText, inline } from '../src/lib/blocks'
import { can, roleDefaults } from '../src/lib/permissions'

test('النص القديم يتحوّل كتلاً بالقواعد نفسها', () => {
  const b = blocksFrom('مقدمة\nتكملة\n\n## ماذا ستتعلم\n- أولاً\n- ثانياً\nخاتمة')
  assert.deepEqual(b.map((x) => x.t), ['p', 'h', 'ul', 'p'])
  assert.equal((b[0] as { text: string }).text, 'مقدمة تكملة')
  assert.deepEqual((b[2] as { items: string[] }).items, ['أولاً', 'ثانياً'])
  assert.match(blocksText(b), /## ماذا ستتعلم/)
})

test('التنسيق داخل السطر: عريض ومائل وروابط آمنة فقط', () => {
  const x = inline('نص **مهم** و*مائل* و[موقع](https://naf.sa) و[خبيث](javascript:alert(1))')
  assert.deepEqual(x.filter((p) => p.kind !== 'text').map((p) => p.kind), ['b', 'i', 'a'])
  const a = x.find((p) => p.kind === 'a') as { href: string }
  assert.equal(a.href, 'https://naf.sa')
  assert.ok(x.some((p) => p.kind === 'text' && p.text.includes('javascript:')), 'الرابط غير الآمن يبقى نصاً')
})

test('الصلاحية المخصّصة تمنح ما ليس في الدور وتحجب ما فيه', () => {
  assert.equal(can('instructor', 'sales.read', null), false)
  assert.equal(can('instructor', 'sales.read', { '+': ['sales.read'], '-': [] }), true)
  assert.equal(can('instructor', 'attendance.mark', { '+': [], '-': ['attendance.mark'] }), false)
  assert.ok(roleDefaults('finance').includes('sales.refund'))
  assert.deepEqual(roleDefaults('غريب'), [])
})

const dir = mkdtempSync(join(tmpdir(), 'naf-contracts-'))
process.env.DATABASE_URL = `file:${join(dir, 't.db')}`
let db: typeof import('../src/server/db')['db']
let s: typeof import('../src/server/db')['schema']
let k: typeof import('../src/server/contracts')

before(async () => {
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  ;({ db, schema: s } = await import('../src/server/db'))
  await migrate(db, { migrationsFolder: './migrations' })
  k = await import('../src/server/contracts')
  await db.insert(s.courses).values([
    { id: 'c1', slug: 'c1', title: 'في العقد', status: 'open', price: 100000, previewToken: 'x' },
    { id: 'c2', slug: 'c2', title: 'خارج العقد', status: 'open', price: 100000, previewToken: 'y' },
  ])
  await db.insert(s.organizations).values({ id: 'o1', name: 'منشأة' })
  await db.insert(s.orgContracts).values({ id: 'k1', orgId: 'o1', title: 'عقد', status: 'active', seats: 2, scope: 'courses', courseIds: ['c1'], endsAt: new Date(Date.now() + 90 * 864e5).toISOString() })
})

test('مقاعد العقد: النطاق والسعة، والوصول حتى نهاية العقد، والعضوية في المؤسسة', async () => {
  const { eq } = await import('drizzle-orm')
  const out = await k.assignContractSeat('k1', { email: 'a@firm.sa', name: 'أ', courseId: 'c2' }, 'اختبار')
  assert.equal(out.ok, false)
  assert.match(out.error ?? '', /خارج نطاق/)
  assert.ok((await k.assignContractSeat('k1', { email: 'a@firm.sa', name: 'أ', courseId: 'c1' }, 'اختبار')).ok)
  const dup = await k.assignContractSeat('k1', { email: 'A@firm.sa', name: 'أ', courseId: 'c1' }, 'اختبار')
  assert.equal(dup.ok, false, 'لا يُخصَّص للشخص نفسه مرتين')
  assert.ok((await k.assignContractSeat('k1', { email: 'b@firm.sa', name: 'ب', courseId: 'c1' }, 'اختبار')).ok)
  const full = await k.assignContractSeat('k1', { email: 'c@firm.sa', name: 'ج', courseId: 'c1' }, 'اختبار')
  assert.match(full.error ?? '', /استُنفدت/)
  const rows = await db.select().from(s.enrollments).where(eq(s.enrollments.contractId, 'k1'))
  assert.equal(rows.length, 2)
  const [c] = await db.select().from(s.orgContracts).where(eq(s.orgContracts.id, 'k1'))
  assert.equal(rows[0].accessUntil, c.endsAt)
  assert.equal((await db.select().from(s.orgMembers).where(eq(s.orgMembers.orgId, 'o1'))).length, 2)
  assert.equal(await k.contractUsed('k1'), 2)
})

test('العقد غير الساري لا يُخصَّص منه', async () => {
  await db.insert(s.orgContracts).values({ id: 'k2', orgId: 'o1', title: 'منتهٍ', status: 'active', seats: 5, endsAt: new Date(Date.now() - 864e5).toISOString() })
  assert.equal(k.contractState({ status: 'active', startsAt: null, endsAt: new Date(Date.now() - 1).toISOString() }), 'expired')
  const r = await k.assignContractSeat('k2', { email: 'd@firm.sa', name: 'د', courseId: 'c1' }, 'اختبار')
  assert.match(r.error ?? '', /غير ساري/)
})
