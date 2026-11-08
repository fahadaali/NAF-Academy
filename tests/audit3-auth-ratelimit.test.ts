/* الفحص الثالث — حدّ المحاولات في القاعدة: العدّ ذرّي ويصمد خارج الذاكرة، وينتهي بنافذته،
   وأحداث Webhook المكررة تُعرف، وقبل التهيئة (لا جدول) يعمل بلا خطأ. */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'

const dir = mkdtempSync(join(tmpdir(), 'naf-audit3r-'))
process.env.DATABASE_URL = `file:${join(dir, 't.db')}`

let rl: typeof import('../src/server/ratelimit')
let db: typeof import('../src/server/db')['db']
let s: typeof import('../src/server/db')['schema']

before(async () => {
  ;({ db, schema: s } = await import('../src/server/db'))
  rl = await import('../src/server/ratelimit')
})

test('قبل التهيئة (لا جدول): العدّ في الذاكرة بلا خطأ', async () => {
  const t0 = 1_000_000
  assert.equal(await rl.bump('pre:x', 1000, t0), 1)
  assert.equal(await rl.bump('pre:x', 1000, t0 + 1), 2)
  assert.equal(await rl.peek('pre:x', t0 + 2), 2)
  assert.equal(await rl.peek('pre:x', t0 + 1000), 0)
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  await migrate(db, { migrationsFolder: './migrations' })
})

test('العدّ في القاعدة ذرّي، وينتهي بنافذته فيبدأ من 1', async () => {
  const t0 = Date.now()
  const all = await Promise.all(Array.from({ length: 12 }, () => rl.bump('login:1.2.3.4', 60_000, t0)))
  assert.deepEqual([...all].sort((a, b) => a - b), Array.from({ length: 12 }, (_, i) => i + 1))
  const [row] = await db.select().from(s.rateLimits).where(eq(s.rateLimits.key, 'login:1.2.3.4'))
  assert.equal(row.n, 12)
  assert.equal(row.resetAt, t0 + 60_000)
  assert.equal(await rl.peek('login:1.2.3.4', t0 + 59_999), 12)
  /* بعد النافذة: لا يُحتسب القديم، والعدّ يبدأ من جديد بنافذة جديدة */
  assert.equal(await rl.peek('login:1.2.3.4', t0 + 60_000), 0)
  assert.equal(await rl.bump('login:1.2.3.4', 60_000, t0 + 60_001), 1)
  const [again] = await db.select().from(s.rateLimits).where(eq(s.rateLimits.key, 'login:1.2.3.4'))
  assert.equal(again.resetAt, t0 + 120_001)
  /* مفتاح آخر مستقل */
  assert.equal(await rl.bump('login:5.6.7.8', 60_000, t0), 1)
})

test('أحداث Webhook: الأول يُقبل والمكرر يُسقط، والمنسي يُقبل من جديد', async () => {
  const t0 = Date.now()
  assert.equal(await rl.firstSeen('svix:msg_1', 600_000, t0), true)
  assert.equal(await rl.firstSeen('svix:msg_1', 600_000, t0 + 5), false)
  assert.equal(await rl.firstSeen('svix:msg_2', 600_000, t0 + 5), true)
  await rl.forgetSeen('svix:msg_1')
  assert.equal(await rl.firstSeen('svix:msg_1', 600_000, t0 + 10), true)
  /* بعد النافذة يُعدّ جديداً (والتوقيع يرفض ما مضى عليه أكثر من خمس دقائق أصلاً) */
  assert.equal(await rl.firstSeen('svix:msg_2', 600_000, t0 + 600_006), true)
})

