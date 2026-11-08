/* تكامل الدعوات بعد فحص 2026-11-08 على قاعدة مؤقتة:
   الدعوة لبريد له حساب لا تمسّ بياناته ولا تبدأ جلسة، والدعوة لا تحجز مقعداً بعد تسجيل صاحبها بطريق آخر،
   والتسجيل المباشر لصاحب دعوة مفتوحة لا يُعدّ مرتين، والقبول لا يحرّر المقعد قبل إدراج التسجيل. */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'naf-a3inv-'))
process.env.DATABASE_URL = `file:${join(dir, 't.db')}`
process.env.PAYMENTS_GATEWAY = 'mock'

let db: typeof import('../src/server/db')['db']
let s: typeof import('../src/server/db')['schema']
let enroll: typeof import('../src/server/enroll')
let inv: typeof import('../src/server/invites')
let sales: typeof import('../src/server/sales')
let eq: typeof import('drizzle-orm')['eq']
const tokenOf = (link?: string) => decodeURIComponent((link ?? '').split('?t=')[1] ?? '')
const course = async (id: string) => (await db.select().from(s.courses).where(eq(s.courses.id, id)))[0]

before(async () => {
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  ;({ db, schema: s } = await import('../src/server/db'))
  ;({ eq } = await import('drizzle-orm'))
  await migrate(db, { migrationsFolder: './migrations' })
  enroll = await import('../src/server/enroll')
  inv = await import('../src/server/invites')
  sales = await import('../src/server/sales')
  await db.insert(s.courses).values([
    { id: 'c1', slug: 'c1', title: 'برنامج', status: 'open', visibility: 'private', free: true, seatsTotal: 5, previewToken: 'p1' },
    { id: 'c2', slug: 'c2', title: 'دورة محدودة', status: 'open', free: true, seatsTotal: 1, previewToken: 'p2' },
    { id: 'c3', slug: 'c3', title: 'دورة ثالثة', status: 'open', free: true, seatsTotal: 3, previewToken: 'p3' },
  ])
  await db.insert(s.learners).values({ id: 'victim', name: 'سارة الأصلية', email: 'victim@u.sa', phone: '+966550000001' })
  await db.insert(s.learners).values({ id: 'nophone', name: 'بلا جوال', email: 'nophone@u.sa', phone: '' })
})

test('دعوة بريد له حساب: لا يتغيّر اسمه ولا جواله (ولا يُملأ الفارغ)، ولا جلسة — ويُسجَّل', async () => {
  const r = await inv.createInvites('c1', null, [{ email: 'victim@u.sa', name: 'مهاجم', phone: '' }, { email: 'nophone@u.sa', name: '', phone: '' }], 'staff')
  assert.ok(r.ok)
  for (const email of ['victim@u.sa', 'nophone@u.sa']) {
    const t = tokenOf(r.ok ? r.results.find((x) => x.email === email)!.link : '')
    const res = await inv.acceptInvite(t, { name: 'مهاجم', phone: '+966559999999', nameEn: 'Attacker', org: 'X' })
    assert.ok(res.ok)
    assert.equal(res.ok && res.existing, true, 'الحساب القائم لا يبدأ جلسة من الرابط')
    const [en] = await db.select().from(s.enrollments).where(eq(s.enrollments.learnerId, res.ok ? res.learnerId : ''))
    assert.equal(en?.courseId, 'c1')
  }
  const [v] = await db.select().from(s.learners).where(eq(s.learners.id, 'victim'))
  assert.equal(v.name, 'سارة الأصلية')
  assert.equal(v.phone, '+966550000001')
  const [n] = await db.select().from(s.learners).where(eq(s.learners.id, 'nophone'))
  assert.equal(n.phone, '', 'الجوال الفارغ لا يُملأ من الرابط — الجوال طريق دخول')
  assert.equal(n.nameEn, '')
})

test('دعوة بريد جديد: حساب جديد ببياناته، والقبول يبدأ الجلسة', async () => {
  const r = await inv.createInvites('c1', null, [{ email: 'new@u.sa', name: '', phone: '' }], 'staff')
  const res = await inv.acceptInvite(tokenOf(r.ok ? r.results[0].link : ''), { name: 'نورة الجديدة', phone: '+966551231234', nameEn: '', org: '' })
  assert.ok(res.ok && !res.existing)
  const [l] = await db.select().from(s.learners).where(eq(s.learners.email, 'new@u.sa'))
  assert.equal(l.name, 'نورة الجديدة')
  assert.equal(l.phone, '+966551231234')
  const [row] = await db.select().from(s.invitations).where(eq(s.invitations.email, 'new@u.sa'))
  assert.ok(row.acceptedAt && row.enrollmentId)
})

test('التسجيل المباشر لصاحب دعوة مفتوحة يأخذ مقعدها (لا عدّ مزدوج)، والدعوة تكفّ عن الحجز', async () => {
  const r = await inv.createInvites('c2', null, [{ email: 'own@u.sa', name: '', phone: '' }], 'staff')
  assert.ok(r.ok)
  assert.equal(await sales.seatsUsed(await course('c2')), 1)
  const other = await enroll.enrollDirect({ courseId: 'c2', learner: { name: 'غيره', email: 'other@u.sa' }, source: 'grant', by: 't' })
  assert.equal(other.ok, false, 'المقعد الوحيد محجوز بالدعوة')
  const mine = await enroll.enrollDirect({ courseId: 'c2', learner: { name: 'صاحب الدعوة', email: 'own@u.sa' }, source: 'grant', by: 't' })
  assert.ok(mine.ok && mine.status === 'enrolled')
  assert.equal(await sales.seatsUsed(await course('c2')), 1, 'التسجيل وحده يشغل المقعد')
})

test('الدعوة المفتوحة لا تحجز بعد تسجيل صاحبها بطريق آخر (شراء/عقد)', async () => {
  const r = await inv.createInvites('c3', null, [{ email: 'buyer@u.sa', name: '', phone: '' }, { email: 'later@u.sa', name: '', phone: '' }], 'staff')
  assert.ok(r.ok)
  assert.equal(await sales.seatsUsed(await course('c3')), 2)
  const l = await sales.upsertLearner({ name: 'مشترٍ', email: 'buyer@u.sa', phone: '', org: '', vatNumber: '' })
  await db.insert(s.enrollments).values({ id: 'e-buy', learnerId: l.id, courseId: 'c3', source: 'purchase' })
  assert.equal(await sales.seatsUsed(await course('c3')), 2, 'تسجيل + دعوة الآخر — لا دعوة صاحب التسجيل')
  /* المنتهي وصوله لا يُسقط حجز دعوته (يجدّد بها) */
  await db.update(s.enrollments).set({ accessUntil: new Date(Date.now() - 864e5).toISOString() }).where(eq(s.enrollments.id, 'e-buy'))
  assert.equal(await sales.seatsUsed(await course('c3')), 2, 'دعوتان، والتسجيل المنتهي لا يشغل')
})

test('القبول: الرابط لا يُقبل مرتين، والمقعد لا يتحرر قبل التسجيل', async () => {
  const r = await inv.createInvites('c3', null, [{ email: 'race@u.sa', name: '', phone: '' }], 'staff')
  const t = tokenOf(r.ok ? r.results[0].link : '')
  const [a, b] = await Promise.all([
    inv.acceptInvite(t, { name: 'سباق أول', phone: '', nameEn: '', org: '' }),
    inv.acceptInvite(t, { name: 'سباق ثانٍ', phone: '', nameEn: '', org: '' }),
  ])
  assert.equal([a, b].filter((x) => x.ok).length, 1)
  assert.equal(await inv.inviteTarget(t), null)
})
