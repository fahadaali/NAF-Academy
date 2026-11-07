/* تكامل البرنامج التعاوني على قاعدة مؤقتة: التسجيل المباشر، والدعوات (تحجز مقعداً، وتُقبل مرة، ويبطلها الإرسال الجديد)،
   والبرنامج الخاص (خارج الكتالوج ولا يُشترى). */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'naf-coop-'))
process.env.DATABASE_URL = `file:${join(dir, 't.db')}`
process.env.PAYMENTS_GATEWAY = 'mock'

let db: typeof import('../src/server/db')['db']
let s: typeof import('../src/server/db')['schema']
let enroll: typeof import('../src/server/enroll')
let inv: typeof import('../src/server/invites')
let sales: typeof import('../src/server/sales')
let cohorts: typeof import('../src/server/cohorts')
const tokenOf = (link?: string) => decodeURIComponent((link ?? '').split('?t=')[1] ?? '')
const prof = (name: string) => ({ name, phone: '', nameEn: '', org: '' })

before(async () => {
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  ;({ db, schema: s } = await import('../src/server/db'))
  await migrate(db, { migrationsFolder: './migrations' })
  enroll = await import('../src/server/enroll')
  inv = await import('../src/server/invites')
  sales = await import('../src/server/sales')
  cohorts = await import('../src/server/cohorts')
  const { setSetting, DEFAULT_PAYMENTS } = await import('../src/server/settings')
  await setSetting('payments', { ...DEFAULT_PAYMENTS, enabled: true })
  await db.insert(s.courses).values([
    { id: 'coop', slug: 'coop', title: 'التدريب التعاوني', status: 'open', visibility: 'private', free: true, previewToken: 'p' },
    { id: 'pub', slug: 'pub', title: 'دورة عامة', status: 'open', price: 1000, seatsTotal: 2, previewToken: 'q' },
  ])
  await db.insert(s.cohorts).values([
    { id: 'k1', courseId: 'coop', title: 'دفعة الخريف', status: 'open', seatsTotal: 2 },
    { id: 'k0', courseId: 'coop', title: 'دفعة منتهية', status: 'closed' },
  ])
})

test('التسجيل المباشر: الدفعة شرط، والمكرر «مسجّل من قبل»، والسعة تُحترم', async () => {
  const none = await enroll.enrollDirect({ courseId: 'coop', learner: { name: 'أ', email: 'a@u.sa' }, source: 'grant', by: 't' })
  assert.equal(none.ok, false)
  const closed = await enroll.enrollDirect({ courseId: 'coop', cohortId: 'k0', learner: { name: 'أ', email: 'a@u.sa' }, source: 'grant', by: 't' })
  assert.equal(closed.ok, false)
  const a = await enroll.enrollDirect({ courseId: 'coop', cohortId: 'k1', learner: { name: 'أحمد', email: 'A@u.sa', phone: '+966551110000' }, source: 'grant', by: 't' })
  assert.ok(a.ok && a.status === 'enrolled')
  const again = await enroll.enrollDirect({ courseId: 'coop', cohortId: 'k1', learner: { name: 'أحمد', email: 'a@u.sa' }, source: 'grant', by: 't' })
  assert.ok(again.ok && again.status === 'already')
  const [e] = await db.select().from(s.enrollments).where((await import('drizzle-orm')).eq(s.enrollments.learnerId, a.ok ? a.learnerId : ''))
  assert.equal(e.source, 'grant'); assert.equal(e.cohortId, 'k1'); assert.equal(e.orderId, null)
})

test('الدعوة تحجز مقعداً، والدفعة الممتلئة ترفض الزائد، والقبول مرة واحدة بلا عدّ مزدوج', async () => {
  const k1 = (await db.select().from(s.cohorts)).find((k) => k.id === 'k1')!
  assert.equal(await cohorts.cohortSeatsUsed(k1), 1)
  const r = await inv.createInvites('coop', 'k1', [{ email: 'b@u.sa', name: '', phone: '' }, { email: 'a@u.sa', name: '', phone: '' }], 'tester')
  assert.ok(r.ok)
  assert.deepEqual(r.ok && r.results.map((x) => x.status).sort(), ['enrolled-before', 'invited'])
  assert.equal(await cohorts.cohortSeatsUsed(k1), 2, 'الدعوة المفتوحة تشغل مقعداً')
  const over = await inv.createInvites('coop', 'k1', [{ email: 'c@u.sa', name: '', phone: '' }], 'tester')
  assert.equal(over.ok, false)
  const direct = await enroll.enrollDirect({ courseId: 'coop', cohortId: 'k1', learner: { name: 'ج', email: 'c@u.sa' }, source: 'grant', by: 't' })
  assert.equal(direct.ok, false, 'المقعد المحجوز بالدعوة لا يأخذه غيره')

  const link = r.ok ? r.results.find((x) => x.email === 'b@u.sa')!.link : ''
  const t = tokenOf(link)
  assert.ok(await inv.inviteTarget(t))
  const ok = await inv.acceptInvite(t, prof('بدر الشمري'))
  assert.ok(ok.ok && ok.slug === 'coop')
  assert.equal(await cohorts.cohortSeatsUsed(k1), 2, 'المقعد انتقل من الدعوة إلى التسجيل')
  const twice = await inv.acceptInvite(t, prof('بدر'))
  assert.equal(twice.ok, false)
  const [l] = await db.select().from(s.learners).where((await import('drizzle-orm')).eq(s.learners.email, 'b@u.sa'))
  assert.equal(l.name, 'بدر الشمري')
})

test('إعادة الإرسال تبطل الرابط السابق، والإلغاء يحرّر المقعد، والرمز المزوّر مرفوض', async () => {
  await db.update(s.cohorts).set({ seatsTotal: 5 })
  const r = await inv.createInvites('coop', 'k1', [{ email: 'd@u.sa', name: 'دانة', phone: '' }], 'tester')
  assert.ok(r.ok)
  const first = tokenOf(r.ok ? r.results[0].link : '')
  const [row] = await db.select().from(s.invitations).where((await import('drizzle-orm')).eq(s.invitations.email, 'd@u.sa'))
  const again = await inv.resendInvite(row.id, 'tester')
  assert.ok(again.ok)
  assert.equal(await inv.inviteTarget(first), null, 'الرابط القديم بطل')
  assert.ok(await inv.inviteTarget(tokenOf(again.ok ? again.link : '')))
  assert.equal(await inv.inviteTarget(first.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'))), null)
  const k1 = (await db.select().from(s.cohorts)).find((k) => k.id === 'k1')!
  const before = await cohorts.cohortSeatsUsed(k1)
  assert.ok((await inv.revokeInvite(row.id, 'tester')).ok)
  assert.equal(await cohorts.cohortSeatsUsed(k1), before - 1)
  assert.equal(await inv.inviteTarget(tokenOf(again.ok ? again.link : '')), null)
})

test('الدعوة المنتهية لا تحجز ولا تُقبل', async () => {
  const r = await inv.createInvites('coop', 'k1', [{ email: 'e@u.sa', name: '', phone: '' }], 'tester')
  assert.ok(r.ok)
  const { eq } = await import('drizzle-orm')
  await db.update(s.invitations).set({ expiresAt: new Date(Date.now() - 1000).toISOString() }).where(eq(s.invitations.email, 'e@u.sa'))
  const res = await inv.acceptInvite(tokenOf(r.ok ? r.results[0].link : ''), prof('إيمان'))
  assert.equal(res.ok, false)
})

test('الدعوة في دورة عامة محدودة المقاعد تُحسب في سعتها', async () => {
  const r = await inv.createInvites('pub', null, [{ email: 'f@u.sa', name: '', phone: '' }, { email: 'g@u.sa', name: '', phone: '' }], 'tester')
  assert.ok(r.ok)
  const [c] = await db.select().from(s.courses).where((await import('drizzle-orm')).eq(s.courses.id, 'pub'))
  assert.equal(await sales.seatsUsed(c), 2)
  const buy = await sales.placeOrder({ slug: 'pub', quantity: 1, buyer: { name: 'زائر', email: 'h@u.sa', phone: '', org: '', vatNumber: '' }, attendSelf: true })
  assert.equal(buy.ok, false, 'لا مقعد للشراء — كله محجوز بالدعوات')
})

test('البرنامج الخاص: خارج الكتالوج، ومرفوض للشراء، وظاهر برمز المعاينة فقط', async () => {
  const q = await import('../src/server/queries')
  const cat = await q.catalog()
  assert.ok(!cat.courses.some((c) => c.slug === 'coop'))
  assert.equal(await q.courseDetail('coop'), null)
  assert.ok(await q.courseDetail('coop', 'p'))
  const buy = await sales.placeOrder({ slug: 'coop', cohortId: 'k1', quantity: 1, buyer: { name: 'زائر', email: 'z@u.sa', phone: '', org: '', vatNumber: '' }, attendSelf: true })
  assert.equal(buy.ok, false)
  assert.match(!buy.ok ? buy.error : '', /بدعوة/)
})
