/* ملفات بناء Cloudflare المولّدة — تُنشأ قبل البناء وتُحذف بعده فلا تُرفع للمستودع (قواعده ترفض رفعها):
   - إعداد OpenNext (ذاكرة الصفحات R2 + وسوم D1 + طابور التجديد)
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
  /* ذاكرة الصفحات: R2 (ربط NEXT_INC_CACHE_R2_BUCKET — دلو الوسائط نفسه تحت incremental-cache/)، ووسوم الإبطال في D1
     (ربط NEXT_TAG_CACHE_D1 — القاعدة نفسها، جدول revalidations من الترحيل 0018)، والتجديد بعد المهلة بطلب إلى العامل نفسه
     (WORKER_SELF_REFERENCE). بلا هذا تكون ذاكرة OpenNext «وهمية» فلا أثر لـ revalidate. */
  if (!existsSync(file)) writeFileSync(file, `import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache'
import d1NextTagCache from '@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache'
import memoryQueue from '@opennextjs/cloudflare/overrides/queue/memory-queue'

export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
  tagCache: d1NextTagCache,
  queue: memoryQueue,
})
`)
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
