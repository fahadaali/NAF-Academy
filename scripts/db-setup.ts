/* يطبّق الترحيلات ثم يبذر المحتوى المبدئي إن كانت القاعدة فارغة.
   يُشغَّل تلقائياً قبل dev وbuild. `--reset` يمسح القاعدة ويعيد البذر. */
import { mkdirSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { count, eq, isNotNull } from 'drizzle-orm'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import * as s from '../src/server/db/schema'
import { seedContent } from '../src/server/setup/seed'
import { applyBrandKit } from './brand-kit'
import { hashPassword } from '../src/lib/staff-crypto'

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

/* محلياً فقط: مالك تجريبي يدخل اللوحة ببريد وكلمة مرور (ADMIN_EMAIL / ADMIN_PASSWORD) — إن لم يكن لأحد كلمة مرور.
   في النشر يُنشأ المالك من صفحة /setup. */
if (url.startsWith('file:')) {
  const [has] = await db.select({ n: count() }).from(s.members).where(isNotNull(s.members.passwordHash))
  if (!has.n) {
    const email = (process.env.ADMIN_EMAIL || 'admin@academy.local').toLowerCase()
    const password = process.env.ADMIN_PASSWORD || 'naf-dev-password'
    const t = Math.floor(Date.now() / 1000)
    const pw = { passwordHash: await hashPassword(password), passwordSetAt: t, role: 'owner', isActive: 1 }
    const [old] = await db.select().from(s.members).where(eq(s.members.email, email))
    if (old) await db.update(s.members).set(pw).where(eq(s.members.userId, old.userId))
    else await db.insert(s.members).values({ userId: randomUUID(), email, displayName: 'مالك تجريبي', createdAt: t, ...pw })
    console.log(`db: local owner ${email} (password from ADMIN_PASSWORD${process.env.ADMIN_PASSWORD ? '' : ' — default naf-dev-password'})`)
  }
}
