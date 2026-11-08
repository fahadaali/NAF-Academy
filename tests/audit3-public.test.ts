/* تدقيق الواجهة العامة على قاعدة مؤقتة: عدّاد المقاعد في الكتالوج يطابق فحص الشراء (seatsUsed/cohortSeatsUsed) —
   المنتهي وصوله لا يشغل مقعداً، والطلب المعلّق الساري يشغله والمنتهي لا؛ وعدّاد الزيارات لا يعدّ دورة غير موجودة. */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { classify, keepKnown, readCapped, slugsOf } from '../src/lib/stats-path'

const dir = mkdtempSync(join(tmpdir(), 'naf-audit3-public-'))
process.env.DATABASE_URL = `file:${join(dir, 't.db')}`
process.env.PAYMENTS_GATEWAY = 'mock'

let db: typeof import('../src/server/db')['db']
let s: typeof import('../src/server/db')['schema']
let q: typeof import('../src/server/queries')
let sales: typeof import('../src/server/sales')
let cohorts: typeof import('../src/server/cohorts')
const who = (email: string) => ({ name: 'متدرب', email, phone: '', org: '', vatNumber: '' })
const day = 864e5

before(async () => {
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  ;({ db, schema: s } = await import('../src/server/db'))
  await migrate(db, { migrationsFolder: './migrations' })
  q = await import('../src/server/queries')
  sales = await import('../src/server/sales')
  cohorts = await import('../src/server/cohorts')
  const { setSetting, DEFAULT_PAYMENTS } = await import('../src/server/settings')
  await setSetting('payments', { ...DEFAULT_PAYMENTS, enabled: true })
  await db.insert(s.courses).values([
    { id: 'cap', slug: 'cap', title: 'دورة بسعة', status: 'open', price: 100000, seatsTotal: 3, previewToken: 'a' },
    { id: 'coh', slug: 'coh', title: 'دورة بدفعة', status: 'open', price: 100000, previewToken: 'b' },
  ])
  await db.insert(s.cohorts).values({ id: 'k1', courseId: 'coh', title: 'الأولى', status: 'open', seatsTotal: 2 })
  await db.insert(s.learners).values([
    { id: 'l1', name: 'منتهٍ', email: 'old@x.sa' },
    { id: 'l2', name: 'سارٍ', email: 'live@x.sa' },
  ])
  await db.insert(s.enrollments).values([
    /* انتهى وصوله: يجدّد دون أن يأخذ مقعداً (holdsSeat) */
    { id: 'e1', learnerId: 'l1', courseId: 'cap', source: 'grant', status: 'active', accessUntil: new Date(Date.now() - day).toISOString() },
    { id: 'e2', learnerId: 'l2', courseId: 'cap', source: 'grant', status: 'active', accessUntil: new Date(Date.now() + 30 * day).toISOString() },
  ])
})

const seatsIn = async (slug: string) => (await q.catalog()).courses.find((c) => c.slug === slug)!

test('الكتالوج: المنتهي وصوله لا يُعدّ، والطلب المعلّق الساري يُعدّ — كما يعدّ الشراء', async () => {
  let c = await seatsIn('cap')
  assert.deepEqual(c.seats, { total: 3, taken: 1 })
  assert.equal(c.status, 'open')

  const r = await sales.placeOrder({ slug: 'cap', quantity: 2, buyer: who('buyer@x.sa'), attendSelf: true })
  assert.ok(r.ok, !r.ok ? r.error : '')
  if (!r.ok) return
  c = await seatsIn('cap')
  assert.deepEqual(c.seats, { total: 3, taken: 3 })
  assert.equal(c.status, 'full', 'المعلّقة السارية تملأ السعة فتظهر «مكتملة» كما يرفضها الدفع')
  assert.equal(c.seats!.taken, await sales.seatsUsed({ id: 'cap', seatsTaken: 0 }))
  const over = await sales.placeOrder({ slug: 'cap', quantity: 1, buyer: who('late@x.sa'), attendSelf: true })
  assert.equal(over.ok, false)

  /* انتهت مهلة الطلب: يعود المقعد للعرض وللشراء معاً */
  const { eq } = await import('drizzle-orm')
  await db.update(s.orders).set({ expiresAt: new Date(Date.now() - 60e3).toISOString() }).where(eq(s.orders.id, r.order.id))
  c = await seatsIn('cap')
  assert.deepEqual(c.seats, { total: 3, taken: 1 })
  assert.equal(c.status, 'open')
  assert.equal(c.seats!.taken, await sales.seatsUsed({ id: 'cap', seatsTaken: 0 }))
})

test('الكتالوج: الطلب المعلّق على دفعة يشغل مقعدها كما cohortSeatsUsed', async () => {
  const r = await sales.placeOrder({ slug: 'coh', cohortId: 'k1', quantity: 2, buyer: who('team@x.sa'), attendSelf: true })
  assert.ok(r.ok, !r.ok ? r.error : '')
  const c = await seatsIn('coh')
  const k = c.cohorts!.find((x) => x.id === 'k1')!
  const [row] = await db.select().from(s.cohorts)
  assert.deepEqual(k.seats, { total: 2, taken: await cohorts.cohortSeatsUsed(row) })
  assert.equal(k.seats!.taken, 2)
  assert.equal(c.status, 'full')
})

test('تفاصيل الدورة والمسار والمدرب تعمل خارج الطلب (cache يمرّر)', async () => {
  const d = await q.courseDetail('cap')
  assert.ok(d)
  assert.equal(d.course.slug, 'cap')
  assert.equal(await q.courseDetail('nope'), null)
  assert.equal(await q.trackDetail('nope'), null)
  assert.equal(await q.instructorDetail('nope'), null)
})

test('عدّاد الزيارات: رابط دورة غير موجودة لا يُنشئ صفاً، والزيارة العامة تبقى', () => {
  const known = new Set(['cap'])
  const has = (x: string) => known.has(x)
  assert.deepEqual(slugsOf(classify('/courses/random-123')), ['random-123'])
  assert.deepEqual(keepKnown(classify('/courses/random-123'), has), [{ metric: 'view', key: '*' }])
  assert.deepEqual(keepKnown(classify('/courses/random-123/enroll'), has), [{ metric: 'view', key: '*' }])
  assert.deepEqual(keepKnown(classify('/courses/cap'), has), [{ metric: 'view', key: '*' }, { metric: 'course', key: 'cap' }])
  assert.deepEqual(slugsOf(classify('/tracks/x')), [])
  assert.deepEqual(keepKnown(classify('/tracks/x'), has), classify('/tracks/x'))
})

test('عدّاد الزيارات: الجسم بسقف — المعلن الكبير يُرفض قبل القراءة، والمتدفّق يُقطع', async () => {
  const req = (body: string, h: Record<string, string> = {}) => new Request('http://x/api/v', { method: 'POST', body, headers: h })
  assert.equal(await readCapped(req('/courses/cap')), '/courses/cap')
  assert.equal(await readCapped(req('x'.repeat(2000))), null)
  assert.equal(await readCapped(req('/', { 'content-length': '999999' })), null)
  let pulled = 0
  const endless = new ReadableStream<Uint8Array>({ pull(c) { pulled++; c.enqueue(new Uint8Array(512)) } })
  const r = new Request('http://x/api/v', { method: 'POST', body: endless, duplex: 'half' } as RequestInit)
  assert.equal(await readCapped(r), null)
  assert.ok(pulled < 10, 'لا يقرأ ما بعد السقف')
})
