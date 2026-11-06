/* يطبّق الترحيلات ثم يبذر المحتوى المبدئي إن كانت القاعدة فارغة.
   يُشغَّل تلقائياً قبل dev وbuild. `--reset` يمسح القاعدة ويعيد البذر. */
import { mkdirSync, rmSync } from 'node:fs'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import * as s from '../src/server/db/schema'
import { seedContent } from '../src/server/setup/seed'
import { applyBrandKit } from './brand-kit'

const url = process.env.DATABASE_URL ?? 'file:.data/academy.db'
if (url.startsWith('file:')) {
  mkdirSync('.data/media', { recursive: true })
  if (process.argv.includes('--reset')) rmSync(url.slice(5), { force: true })
}

const db = drizzle(createClient({ url }), { schema: s })
await migrate(db, { migrationsFolder: './migrations' })
/* حزمة الهوية المعتمدة — مرة لكل إصدار منها، قبل البذر وبعده */
await applyBrandKit(db, { local: url.startsWith('file:') })

const r = await seedContent(db)
console.log(r ? `db: seeded ${r.tracks} tracks, ${r.courses} courses, ${r.instructors} instructors` : 'db: ready')
