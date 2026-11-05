/* حدود D1: القوائم الطويلة بمعامل واحد، والإدخال على دفعات لا تتجاوز 100 معامل */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'naf-limits-'))
process.env.DATABASE_URL = `file:${join(dir, 't.db')}`

test('inList بمعامل واحد مهما طالت القائمة، وchunksOf تحت الحد', async () => {
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  const { db, schema: s } = await import('../src/server/db')
  await migrate(db, { migrationsFolder: './migrations' })
  const { inList, chunksOf, MAX_PARAMS } = await import('../src/server/db/limits')
  const { getTableColumns } = await import('drizzle-orm')
  const ids = Array.from({ length: 500 }, (_, i) => `t${i}`)
  const q = db.select().from(s.tracks).where(inList(s.tracks.id, ids)).toSQL()
  assert.equal(q.params.length, 1)
  for (const table of [s.notifications, s.seatGrants, s.lessons, s.coupons]) {
    const cols = Object.keys(getTableColumns(table)).length
    const parts = chunksOf(table, Array.from({ length: 237 }, (_, i) => i))
    assert.ok(parts.every((p) => p.length * cols <= MAX_PARAMS))
    assert.equal(parts.flat().length, 237)
  }
  await db.insert(s.tracks).values({ id: 't7', slug: 't7', title: 'مسار' })
  const hit = await db.select().from(s.tracks).where(inList(s.tracks.id, ids))
  assert.equal(hit.length, 1)
})
