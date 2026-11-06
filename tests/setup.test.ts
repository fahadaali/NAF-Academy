/* التهيئة من المتصفح: الترحيلات تُطبَّق من التطبيق بسجل wrangler نفسه (d1_migrations)، ولا تتكرر، وتكمل ما طبّقه wrangler؛
   والبذرة وحزمة الهوية مرة واحدة. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { sql } from 'drizzle-orm'
import * as s from '../src/server/db/schema'
import { applyMigrations, libsqlRunner, migrationStatus, MIGRATION_COUNT } from '../src/server/setup/migrate'
import { seedContent } from '../src/server/setup/seed'
import { applyBrandKit } from '../src/server/setup/brand-kit'

const fresh = () => { const c = createClient({ url: `file:${join(mkdtempSync(join(tmpdir(), 'naf-setup-')), 't.db')}` }); return Object.assign(drizzle(c, { schema: s }), { r: libsqlRunner(c) }) }

test('قاعدة فارغة: كل الترحيلات تُطبَّق وتُسجَّل، والثانية لا تفعل شيئاً', async () => {
  const db = fresh()
  const r = await applyMigrations(db.r)
  assert.equal(r.error, undefined)
  assert.equal(r.applied.length, MIGRATION_COUNT)
  assert.equal((await applyMigrations(db.r)).applied.length, 0)
  assert.deepEqual((await migrationStatus(db.r)).pending, [])
})

test('ما طبّقه wrangler يُعرف فيكتمل الباقي وحده', async () => {
  const db = fresh()
  const first = await applyMigrations(db.r)
  assert.ok(first.applied.length > 3)
  /* نحاكي قاعدة طبّق wrangler أول ثلاثة ملفات منها فقط: نحذف سجل الباقي ونعيد بناءها من الصفر */
  const db2 = fresh()
  const { MIGRATIONS } = await import('../src/server/setup/migrations.generated')
  for (const m of MIGRATIONS.slice(0, 3)) for (const q of m.statements) await db2.run(sql.raw(q))
  await db2.run(sql.raw('CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)'))
  for (const m of MIGRATIONS.slice(0, 3)) await db2.run(sql`INSERT INTO d1_migrations (name) VALUES (${m.name})`)
  const r = await applyMigrations(db2.r)
  assert.equal(r.error, undefined)
  assert.equal(r.applied.length, MIGRATION_COUNT - 3)
})

test('البذرة وحزمة الهوية مرة واحدة، والملفات إلى التخزين', async () => {
  const db = fresh()
  await applyMigrations(db.r)
  const seeded = await seedContent(db)
  assert.ok(seeded && seeded.courses > 0)
  assert.equal(await seedContent(db), null)
  const put = new Map<string, number>()
  const KIT = 'src/content/brand-kit'
  const io = { load: async (p: string) => (existsSync(join(KIT, p)) ? new Uint8Array(readFileSync(join(KIT, p))) : null), put: async (k: string, b: Uint8Array) => { put.set(k, b.length) } }
  assert.equal(await applyBrandKit(db, io), 'applied')
  assert.ok([...put.keys()].some((k) => k.startsWith('brand-')))
  assert.equal(await applyBrandKit(db, io), 'current')
  const [brand] = await db.select().from(s.settings).where(sql`${s.settings.key} = 'brand'`)
  assert.ok(brand)
})
