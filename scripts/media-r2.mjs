/* يرفع ملفات الوسائط المحلية (.data/media) إلى R2 بالمفاتيح نفسها — مكمّل db:seed:remote الذي ينقل صفوفها إلى D1.
   npm run media:r2              ← كل الملفات
   npm run media:r2 -- brand-    ← ما يبدأ مفتاحه بالبادئة فقط (حزمة الهوية مثلاً)
   الرفع يعيد الكتابة بالمحتوى نفسه، فتكراره آمن. */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const BUCKET = 'naf-academy-media'
const DIR = '.data/media'
const TYPES = { png: 'image/png', svg: 'image/svg+xml', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', pdf: 'application/pdf' }
const prefix = process.argv[2] ?? ''

const files = readdirSync(DIR).filter((f) => f.startsWith(prefix) && /^[\w.-]{1,128}$/.test(f))
for (const f of files) {
  const type = TYPES[f.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'
  execFileSync('npx', ['wrangler', 'r2', 'object', 'put', `${BUCKET}/${f}`, `--file=${join(DIR, f)}`, `--content-type=${type}`, '--remote'], { stdio: 'inherit' })
}
console.log(`media-r2: ${files.length} file(s) → ${BUCKET}`)
