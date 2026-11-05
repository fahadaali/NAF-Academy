/* الفحص الشامل الثاني — الرسائل: «فُتح التسجيل» يرى الدفعات، والمكتوم يُتخطّى بلا إعادة محاولة،
   ومن لا صفّ لدفعته يُذكَّر بموعد الدرس نفسه (القاعدة نفسها في صفحات التعلّم). */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'

const dir = mkdtempSync(join(tmpdir(), 'naf-audit2n-'))
process.env.DATABASE_URL = `file:${join(dir, 't.db')}`

let e: typeof import('../src/server/notify/engine')
let db: typeof import('../src/server/db')['db']
let s: typeof import('../src/server/db')['schema']
const rowsOf = (event: string) => db.select().from(s.notifications).where(eq(s.notifications.event, event))
const START = '2026-12-10T15:00:00.000Z'

before(async () => {
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  ;({ db, schema: s } = await import('../src/server/db'))
  await migrate(db, { migrationsFolder: './migrations' })
  e = await import('../src/server/notify/engine')
  const { setSetting } = await import('../src/server/settings')
  await setSetting('channels', { emailEnabled: true, smsEnabled: false })
  await db.insert(s.courses).values({ id: 'c1', slug: 'c1', title: 'بدفعات', status: 'open', price: 0, free: true, previewToken: 'x', mode: 'live' })
  await db.insert(s.cohorts).values({ id: 'k1', courseId: 'c1', title: 'القادمة', status: 'soon' })
  await db.insert(s.modules).values({ id: 'm1', courseId: 'c1', title: 'و', sortOrder: 0 })
  await db.insert(s.lessons).values({ id: 'L1', moduleId: 'm1', title: 'الجلسة', type: 'live', minutes: 90, sortOrder: 0, startsAt: START, endsAt: '2026-12-10T16:30:00.000Z' })
  await db.insert(s.learners).values([{ id: 'a', name: 'سارة', email: 'sara@x.sa' }, { id: 'b', name: 'مكتوم', email: 'gone@x.sa' }])
  /* «أ» في دفعة لا صفّ لها لهذا الدرس — يتبع موعد الدرس */
  await db.insert(s.enrollments).values({ id: 'ea', learnerId: 'a', courseId: 'c1', cohortId: 'k1', source: 'manual', createdAt: '2026-11-20T00:00:00.000Z' })
})

test('«فُتح التسجيل» لا يُرسل والدفعات كلها «قريباً»، ويُرسل حين تُفتح دفعة', async () => {
  await db.insert(s.interest).values({ id: 'i1', courseId: 'c1', kind: 'next_cohort', name: 'ريم', email: 'reem@x.sa' })
  await e.runNotifications(new Date('2026-12-01T00:00:00Z'))
  assert.equal((await rowsOf('registration_open')).length, 0)
  await db.update(s.cohorts).set({ status: 'open' }).where(eq(s.cohorts.id, 'k1'))
  await e.runNotifications(new Date('2026-12-01T00:05:00Z'))
  assert.deepEqual((await rowsOf('registration_open')).map((x) => x.status), ['sent'])
})

test('من لا صفّ لدفعته يُذكَّر بموعد الدرس نفسه', async () => {
  await e.runNotifications(new Date('2026-12-03T15:02:00Z'))
  const rem = await rowsOf('session_reminder')
  assert.equal(rem.length, 1)
  assert.equal(rem[0].to, 'sara@x.sa')
})

test('العنوان المكتوم يُتخطّى من أول مرة ولا يُعاد', async () => {
  await db.insert(s.mailSuppressions).values({ email: 'gone@x.sa', reason: 'bounce' })
  await db.insert(s.enrollments).values({ id: 'eb', learnerId: 'b', courseId: 'c1', source: 'manual' })
  await e.onEnrolled('eb')
  const [n] = (await rowsOf('enrolled')).filter((x) => x.to === 'gone@x.sa')
  assert.equal(n.status, 'skipped')
  assert.equal(n.attempts, 1)
  /* والإشعار داخل المنصة يصل */
  const inbox = await db.select().from(s.inbox).where(eq(s.inbox.learnerId, 'b'))
  assert.equal(inbox.length, 1)
})
