/* قبل التهيئة (قاعدة بلا جداول): غلاف الموقع و404 يُعرضان بالمحتوى الافتراضي لا 500 —
   homeContent وpagesContent يمرّان بـ getSetting (notMigrated). */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'naf-audit3-premig-'))
process.env.DATABASE_URL = `file:${join(dir, 't.db')}`

test('homeContent قبل الترحيلات يعيد الافتراضي', async () => {
  const q = await import('../src/server/queries')
  const { DEFAULT_HOME } = await import('../src/content/home-defaults')
  const home = await q.homeContent()
  assert.ok(home.sections.length >= DEFAULT_HOME.sections.length)
  assert.deepEqual(home.footer, DEFAULT_HOME.footer)
  assert.ok(home.hero)
  const pages = await q.pagesContent()
  assert.ok(pages.courses)
})
