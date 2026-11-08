/* التعلّم بعد فحص 2026-11-08: تجاوز إكمال السلايدات، ومعاينة الدورة الخاصة، وتسابق فتح محاولة الاختبار. */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { availability, previewOpen, slideReach, slideStart, takesHeartbeat } from '../src/lib/learning'

const dir = mkdtempSync(join(tmpdir(), 'naf-a3learn-'))
process.env.DATABASE_URL = `file:${join(dir, 't.db')}`

test('السلايدات: موضع مخزّن يتجاوز عدد الشرائح (نبضة فيديو) لا يُعدّ بلوغاً للأخيرة', () => {
  const r = slideReach(slideStart(99999, 10), 1, 10)
  assert.deepEqual(r, { furthest: 1, done: false })
  assert.equal(slideStart(7, 10), 7)
  assert.equal(slideStart(10, 10), 10)
  assert.equal(slideStart(-3, 10), 0)
  assert.equal(slideStart(Number.NaN, 10), 0)
  /* التقدّم المشروع شريحةً شريحة ما زال يكتمل */
  let prev = 0
  for (let p = 1; p <= 3; p++) prev = slideReach(slideStart(prev, 3), p, 3).furthest
  assert.equal(slideReach(prev, 3, 3).done, true)
})

test('نبضة المشاهدة للفيديو وتسجيل الجلسة فقط — لا للسلايدات ولا غيرها', () => {
  assert.equal(takesHeartbeat({ type: 'video' }), true)
  assert.equal(takesHeartbeat({ type: 'slides' }), false)
  assert.equal(takesHeartbeat({ type: 'article' }), false)
  assert.equal(takesHeartbeat({ type: 'quiz' }), false)
  assert.equal(takesHeartbeat({ type: 'live', recording: { provider: 'stream' } }), true)
  assert.equal(takesHeartbeat({ type: 'live', recording: { provider: 'none' } }), false)
  assert.equal(takesHeartbeat({ type: 'onsite', recording: null }), false)
})

test('المعاينة: للدورة العامة الظاهرة وحدها', () => {
  const now = new Date('2026-11-08T12:00:00Z')
  assert.equal(previewOpen({ visibility: 'public', status: 'open', publishAt: null }, now), true)
  assert.equal(previewOpen({ visibility: 'public', status: 'closed', publishAt: null }, now), true)
  assert.equal(previewOpen({ visibility: 'private', status: 'open', publishAt: null }, now), false, 'البرنامج الخاص')
  assert.equal(previewOpen({ visibility: 'public', status: 'draft', publishAt: null }, now), false, 'المسودة')
  assert.equal(previewOpen({ visibility: 'public', status: 'archived', publishAt: null }, now), false, 'المؤرشفة')
  assert.equal(previewOpen({ visibility: 'public', status: 'scheduled', publishAt: '2026-12-01T00:00:00Z' }, now), false, 'المجدولة قبل موعدها')
  assert.equal(previewOpen({ visibility: 'public', status: 'scheduled', publishAt: '2026-11-01T00:00:00Z' }, now), true)
})

let db: typeof import('../src/server/db')['db']
let s: typeof import('../src/server/db')['schema']
let learning: typeof import('../src/server/learning')

before(async () => {
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  ;({ db, schema: s } = await import('../src/server/db'))
  await migrate(db, { migrationsFolder: './migrations' })
  learning = await import('../src/server/learning')
  await db.insert(s.courses).values([
    { id: 'pub', slug: 'pub', title: 'عامة', status: 'open', previewToken: 'a' },
    { id: 'prv', slug: 'prv', title: 'خاصة', status: 'open', visibility: 'private', previewToken: 'b' },
    { id: 'drf', slug: 'drf', title: 'مسودة', status: 'draft', previewToken: 'c' },
  ])
  for (const c of ['pub', 'prv', 'drf']) {
    await db.insert(s.modules).values({ id: `m-${c}`, courseId: c, title: 'و' })
    await db.insert(s.lessons).values({ id: `l-${c}`, moduleId: `m-${c}`, title: 'معاينة', type: 'video', preview: true })
  }
  await db.insert(s.lessons).values({ id: 'quiz', moduleId: 'm-pub', title: 'اختبار', type: 'quiz', sortOrder: 1 })
  await db.insert(s.learners).values({ id: 'me', name: 'متدرب', email: 'me@u.sa' })
})

test('درس المعاينة يُفتح للزائر في الدورة العامة فقط', async () => {
  for (const [slug, open] of [['pub', true], ['prv', false], ['drf', false]] as const) {
    const ctx = await learning.learnerCourse(slug, null)
    const l = ctx!.modules[0].lessons.find((x) => x.id === `l-${slug}`)!
    assert.equal(l.access.state === 'open', open, slug)
    assert.equal(await learning.lessonView(slug, `l-${slug}`, null) !== null, open, slug)
  }
  /* القاعدة نفسها في الإتاحة النقية: بلا تسجيل، المعاينة وحدها */
  const acc = availability([{ id: 'x', type: 'video', drip: { mode: 'none', date: null, days: null }, preview: false }], { enrolledAt: null, sequential: false, completed: new Set() })
  assert.equal(acc.get('x')?.state, 'enroll')
})

test('فتح محاولة الاختبار ذرّي: الطلبات المتوازية تأخذ المحاولة نفسها، والحد يُحترم', async () => {
  const rs = await Promise.all(Array.from({ length: 6 }, () => learning.openAttempt('me', 'quiz', 1)))
  assert.ok(rs.every((r) => r.ok))
  const ids = new Set(rs.map((r) => (r.ok ? r.id : '')))
  assert.equal(ids.size, 1, 'محاولة مفتوحة واحدة')
  const { eq } = await import('drizzle-orm')
  const rows = await db.select().from(s.quizAttempts).where(eq(s.quizAttempts.learnerId, 'me'))
  assert.equal(rows.length, 1)
  await db.update(s.quizAttempts).set({ submittedAt: new Date().toISOString(), passed: false, scorePct: 10 }).where(eq(s.quizAttempts.id, rows[0].id))
  const more = await Promise.all(Array.from({ length: 4 }, () => learning.openAttempt('me', 'quiz', 1)))
  assert.ok(more.every((r) => !r.ok && r.error.includes('استنفدت')))
  assert.equal((await db.select().from(s.quizAttempts).where(eq(s.quizAttempts.learnerId, 'me'))).length, 1)
  /* بلا حد: محاولة جديدة بعد التسليم، ولا جديدة بعد النجاح */
  const next = await learning.openAttempt('me', 'quiz', null)
  assert.ok(next.ok)
  await db.update(s.quizAttempts).set({ submittedAt: new Date().toISOString(), passed: true, scorePct: 90 }).where(eq(s.quizAttempts.id, next.ok ? next.id : ''))
  const done = await learning.openAttempt('me', 'quiz', null)
  assert.ok(!done.ok && done.error.includes('اجتزت'))
})
