/* غلاف سطر الأوامر لحزمة الهوية — المنطق في src/server/setup/brand-kit.ts (مشترك مع صفحة /setup في النشر).
   يُستدعى من db-setup، أو مباشرة: tsx scripts/brand-kit.ts [--force] */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { applyBrandKit as apply, type KitIO } from '../src/server/setup/brand-kit'
export { KIT_VERSION } from '../src/server/setup/brand-kit'

const DIR = join(process.cwd(), 'src/content/brand-kit')
const MEDIA = join(process.cwd(), '.data/media')

/** القرص: الحزمة من المستودع، والملفات إلى .data/media (محلياً فقط) */
const diskIO = (local: boolean): KitIO => ({
  load: async (p) => (existsSync(join(DIR, p)) ? new Uint8Array(readFileSync(join(DIR, p))) : null),
  put: async (key, bytes) => { if (local) { mkdirSync(MEDIA, { recursive: true }); writeFileSync(join(MEDIA, key), bytes) } },
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function applyBrandKit(db: LibSQLDatabase<any>, opts: { force?: boolean; local?: boolean } = {}) {
  const r = await apply(db, diskIO(opts.local !== false), { force: opts.force })
  if (r === 'applied') console.log('brand-kit: applied')
}

if (process.argv[1]?.endsWith('brand-kit.ts')) {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const s = await import('../src/server/db/schema')
  const url = process.env.DATABASE_URL ?? 'file:.data/academy.db'
  await applyBrandKit(drizzle(createClient({ url }), { schema: s }), { force: process.argv.includes('--force'), local: url.startsWith('file:') })
}
