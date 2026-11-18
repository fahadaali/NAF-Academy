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
  /* السرعة: ذاكرة إقليمية (Cache API في مركز البيانات القريب) فوق R2 — الصفحة المخزّنة لا تُقرأ من الدلو البعيد في كل طلب
     (تُحدَّث منه في الخلفية، ووسوم الإبطال في D1 تُفحص كما هي فلا يبقى قديم بعد revalidatePath)؛
     واعتراض الذاكرة: الصفحة المخزّنة تُعاد قبل تحميل خادم Next كله — أثره الأكبر في أول طلب لنسخة باردة من العامل. */
  if (!existsSync(file)) writeFileSync(file, `import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache'
import { withRegionalCache } from '@opennextjs/cloudflare/overrides/incremental-cache/regional-cache'
import d1NextTagCache from '@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache'
import memoryQueue from '@opennextjs/cloudflare/overrides/queue/memory-queue'

export default defineCloudflareConfig({
  incrementalCache: withRegionalCache(r2IncrementalCache, { mode: 'long-lived' }),
  tagCache: d1NextTagCache,
  queue: memoryQueue,
  enableCacheInterception: true,
})
`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(worker, `// مولّد — لا يُحرَّر (scripts/cf-config.mjs)
import app from '../${build}/worker.js'
export * from '../${build}/worker.js'

export default {
  fetch: (req, env, ctx) => app.fetch(req, env, ctx),
  /* كل 5 دقائق: جدولة الرسائل المستحقة وإرسال أول دفعة، ثم دفعات تالية ما بقي مستحق — كل دفعة طلب مستقل
     إلى العامل نفسه (WORKER_SELF_REFERENCE) فلها سقف استعلامات D1 خاص بها */
  async scheduled(_event, env, ctx) {
    const auth = { authorization: \`Bearer \${env.CRON_SECRET}\` }
    const run = async () => {
      const first = await app.fetch(new Request(\`\${env.SITE_URL}/api/cron/notify\`, { method: 'POST', headers: auth }), env, ctx)
      let more = !!(await first.json().catch(() => ({}))).more
      for (let i = 0; more && i < 8 && env.WORKER_SELF_REFERENCE; i++) {
        const r = await env.WORKER_SELF_REFERENCE.fetch(\`\${env.SITE_URL}/api/cron/notify?drain=1\`, { method: 'POST', headers: auth })
        more = r.ok && !!(await r.json().catch(() => ({}))).more
      }
    }
    ctx.waitUntil(run())
  },
}
`)
}
