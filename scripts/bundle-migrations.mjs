/* يحزم ملفات migrations/*.sql في وحدة TypeScript يطبّقها التطبيق نفسه على D1 من صفحة /setup والمشغّل الدوري —
   فلا حاجة لطرفية. مولَّد (لا يُرفع). وينسخ حزمة الهوية إلى public/_kit ليقرأها الـWorker من ASSETS. */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const files = readdirSync('migrations').filter((f) => /^\d{4}_[\w-]+\.sql$/.test(f)).sort()
const list = files.map((name) => ({
  name,
  statements: readFileSync(join('migrations', name), 'utf8').split('--> statement-breakpoint').map((x) => x.trim()).filter(Boolean),
}))
const out = `/* مولَّد من migrations/*.sql — لا يُحرَّر (scripts/bundle-migrations.mjs) */\nexport const MIGRATIONS: { name: string; statements: string[] }[] = ${JSON.stringify(list, null, 1)}\n`
const target = 'src/server/setup/migrations.generated.ts'
if (!existsSync(target) || readFileSync(target, 'utf8') !== out) writeFileSync(target, out)

/* حزمة الهوية: الصور وحدها (SVG وPNG) بمساراتها النسبية */
const KIT = 'src/content/brand-kit'
const copy = (dir) => {
  for (const f of readdirSync(join(KIT, dir))) {
    const rel = join(dir, f)
    if (statSync(join(KIT, rel)).isDirectory()) copy(rel)
    else if (/\.(svg|png)$/i.test(f)) { mkdirSync(join('public/_kit', dir), { recursive: true }); copyFileSync(join(KIT, rel), join('public/_kit', rel)) }
  }
}
if (existsSync(KIT)) copy('')
