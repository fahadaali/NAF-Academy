'use server'
/* طلب «للمؤسسات» من الرئيسية — يُحفظ ويُبلَّغ الفريق بالبريد. حقل مخفي يصدّ البرامج الآلية. */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { db, schema as s } from '@/server/db'
import { limited } from '@/server/ratelimit'
import { corporateSettings } from '@/server/settings'
import { send } from '@/server/notify/channels'
import { renderEmail } from '@/server/notify/templates'
import { siteUrl } from '@/server/site'

const input = z.object({
  name: z.string().trim().min(2, 'الاسم مطلوب').max(120),
  org: z.string().trim().min(2, 'اسم الجهة مطلوب').max(160),
  contact: z.string().trim().min(5, 'البريد أو الجوال مطلوب').max(160),
  size: z.string().trim().max(40),
  interests: z.array(z.string().trim().max(80)).max(20),
  message: z.string().trim().max(2000).default(''),
  website: z.string().max(0).optional(),
})

export async function corporateRequest(raw: unknown): Promise<{ ok: boolean; error?: string }> {
  if (await limited('corporate', 5, 30 * 60e3)) return { ok: false, error: 'محاولات كثيرة — حاول لاحقاً' }
  const p = input.safeParse(raw)
  if (!p.success) return p.error.issues.some((i) => i.path[0] === 'website') ? { ok: true } : { ok: false, error: p.error.issues[0]?.message }
  const { website: _w, ...v } = p.data
  const id = randomUUID()
  await db.insert(s.corporateRequests).values({ id, ...v })
  const { notify } = await corporateSettings()
  const site = siteUrl()
  if (site) {
    for (const to of notify) {
      const { html, text } = renderEmail({
        site, heading: `طلب مؤسسة: ${v.org}`, body: v.message || 'طلب جديد من نموذج «للمؤسسات» في الرئيسية.',
        facts: [['الاسم', v.name], ['الجهة', v.org], ['التواصل', v.contact], ['حجم الفريق', v.size], ['الاهتمامات', v.interests.join('، ')]],
        cta: { label: 'فتح الطلب', href: `${site}/admin/corporate?id=${id}` },
      })
      await send({ channel: 'email', to, subject: `طلب مؤسسة جديد — ${v.org}`, text, html, kind: 'corporate' }).catch(() => {})
    }
  }
  return { ok: true }
}
