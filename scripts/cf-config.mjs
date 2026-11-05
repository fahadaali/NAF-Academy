/* ملفات بناء Cloudflare المولّدة — تُنشأ قبل البناء وتُحذف بعده فلا تُرفع للمستودع (قواعده ترفض رفعها):
   - إعداد OpenNext
   - غلاف الـWorker (.cf/worker.mjs): يمرّر الطلبات لـOpenNext، ويضيف معالج scheduled للرسائل الآلية.
   الاستخدام: node scripts/cf-config.mjs create | remove */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'

const file = 'open-next.config.ts'
const dir = '.cf'
const worker = `${dir}/worker.mjs`
const build = '.open-next'

if (process.argv[2] === 'remove') {
  rmSync(file, { force: true })
} else {
  if (!existsSync(file)) writeFileSync(file, "import { defineCloudflareConfig } from '@opennextjs/cloudflare'\n\nexport default defineCloudflareConfig()\n")
  mkdirSync(dir, { recursive: true })
  writeFileSync(worker, `// مولّد — لا يُحرَّر (scripts/cf-config.mjs)
import app from '../${build}/worker.js'
export * from '../${build}/worker.js'

export default {
  fetch: (req, env, ctx) => app.fetch(req, env, ctx),
  /* كل 5 دقائق: جدولة الرسائل المستحقة وإرسالها */
  async scheduled(_event, env, ctx) {
    const req = new Request(\`\${env.SITE_URL}/api/cron/notify\`, { method: 'POST', headers: { authorization: \`Bearer \${env.CRON_SECRET}\` } })
    ctx.waitUntil(app.fetch(req, env, ctx))
  },
}
`)
}
