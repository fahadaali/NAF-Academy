/* يصدّر محتوى القاعدة المحلية (المحتوى لا المبيعات) إلى SQL لبذر D1 عند أول نشر:
   npm run db:seed:remote — يُدرج بـ INSERT OR IGNORE فلا يمسّ بيانات قائمة. */
import { writeFileSync } from 'node:fs'
import { createClient } from '@libsql/client'

const TABLES = ['media', 'tracks', 'instructors', 'courses', 'course_instructors', 'modules', 'lessons', 'price_tiers', 'group_rules', 'settings', 'certificate_templates']
const db = createClient({ url: process.env.DATABASE_URL ?? 'file:.data/academy.db' })
const q = (v: unknown) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' || typeof v === 'bigint' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)
const out: string[] = ['-- بذرة محتوى أكاديمية ناف (مولّدة)']
for (const t of TABLES) {
  const r = await db.execute(`SELECT * FROM ${t}`)
  for (const row of r.rows) {
    const cols = r.columns
    out.push(`INSERT OR IGNORE INTO ${t} (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${cols.map((c) => q(row[c as keyof typeof row])).join(',')});`)
  }
}
writeFileSync('.data/seed.sql', out.join('\n') + '\n')
console.log(`seed: ${out.length - 1} rows → .data/seed.sql`)
