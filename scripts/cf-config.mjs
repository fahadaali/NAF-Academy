/* إعداد OpenNext لبناء Cloudflare: يُنشأ قبل البناء ويُحذف بعده، فلا يُرفع للمستودع
   (قواعد المستودع ترفض رفعه). الاستخدام: node scripts/cf-config.mjs create | remove */
import { existsSync, rmSync, writeFileSync } from 'node:fs'

const file = 'open-next.config.ts'
if (process.argv[2] === 'remove') rmSync(file, { force: true })
else if (!existsSync(file)) writeFileSync(file, "import { defineCloudflareConfig } from '@opennextjs/cloudflare'\n\nexport default defineCloudflareConfig()\n")
