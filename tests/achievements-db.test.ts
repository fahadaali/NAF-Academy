/* الإنجازات والإشعارات داخل المنصة على قاعدة مؤقتة: تُمنح مرة واحدة وتصل إشعاراً واحداً */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'naf-ach-'))
process.env.DATABASE_URL = `file:${join(dir, 't.db')}`
let db: typeof import('../src/server/db')['db']
let s: typeof import('../src/server/db')['schema']
let a: typeof import('../src/server/achievements')

before(async () => {
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  ;({ db, schema: s } = await import('../src/server/db'))
  await migrate(db, { migrationsFolder: './migrations' })
  a = await import('../src/server/achievements')
  await db.insert(s.learners).values({ id: 'l1', name: 'متدرب', email: 'l@x.sa' })
  await db.insert(s.courses).values({ id: 'c1', slug: 'c1', title: 'دورة', status: 'open', price: 0, free: true, previewToken: 'x' })
  await db.insert(s.modules).values({ id: 'm1', courseId: 'c1', title: 'و', sortOrder: 0 })
  await db.insert(s.lessons).values([{ id: 'a1', moduleId: 'm1', title: 'د1', type: 'article', sortOrder: 0 }, { id: 'a2', moduleId: 'm1', title: 'د2', type: 'article', sortOrder: 1 }])
  await db.insert(s.enrollments).values({ id: 'e1', learnerId: 'l1', courseId: 'c1', source: 'free' })
})

test('إكمال درس يمنح «الخطوة الأولى» و«منتصف الطريق» مرة واحدة، بإشعار لكل منهما', async () => {
  const now = new Date().toISOString()
  await db.insert(s.lessonProgress).values({ learnerId: 'l1', lessonId: 'a1', courseId: 'c1', completedAt: now })
  await a.evaluateAchievements('l1')
  await a.evaluateAchievements('l1')
  const got = (await a.learnerAchievements('l1')).map((x) => x.kind).sort()
  assert.deepEqual(got, ['first_lesson', 'halfway'])
  const box = await a.inboxOf('l1')
  assert.equal(box.rows.length, 2)
  assert.equal(box.unread, 2)
  await a.toInbox('l1', { key: 'k', kind: 'x', title: 'ت' })
  await a.toInbox('l1', { key: 'k', kind: 'x', title: 'ت' })
  assert.equal((await a.inboxOf('l1')).rows.length, 3, 'المفتاح الفريد يمنع التكرار')
})
