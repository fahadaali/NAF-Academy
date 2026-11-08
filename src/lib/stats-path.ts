/* تصنيف المسار لعدّاد الزيارات — دالة نقية مختبرة. لا يُعدّ إلا الصفحات العامة. */
export type Hit = { metric: string; key: string }

export function classify(path: string): Hit[] {
  const p = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/'
  if (!p.startsWith('/') || p.length > 200 || /^\/(admin|api|auth|learn|_next|files|orders|unsubscribe)(\/|$)/.test(p)) return []
  const out: Hit[] = [{ metric: 'view', key: '*' }]
  let m: RegExpMatchArray | null
  if ((m = p.match(/^\/courses\/([a-z0-9-]{1,80})\/enroll$/))) out.push({ metric: 'checkout', key: m[1] })
  else if ((m = p.match(/^\/courses\/([a-z0-9-]{1,80})$/))) out.push({ metric: 'course', key: m[1] })
  else if (p === '/' ) out.push({ metric: 'page', key: 'home' })
  else if ((m = p.match(/^\/(courses|tracks|instructors|certificates)(\/|$)/))) out.push({ metric: 'page', key: m[1] })
  return out
}

export const isBot = (ua: string) => !ua || /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python|axios/i.test(ua)

/** المقاييس التي مفتاحها رابط دورة — لا تُعدّ إلا لدورة موجودة، فلا يُنشئ رابط عشوائي صفوفاً بلا حدّ في stats_daily */
const SLUG_METRICS = new Set(['course', 'checkout'])

/** روابط الدورات التي يلزم التحقق من وجودها قبل العدّ */
export const slugsOf = (hits: Hit[]) => [...new Set(hits.filter((h) => SLUG_METRICS.has(h.metric)).map((h) => h.key))]

/** يُسقط عدّ الدورة غير الموجودة ويُبقي الزيارة العامة (مفتاحها ثابت) */
export const keepKnown = (hits: Hit[], known: (slug: string) => boolean): Hit[] =>
  hits.filter((h) => !SLUG_METRICS.has(h.metric) || known(h.key))

/** أقصى جسم يقبله العدّاد — المسار وحده */
export const BEACON_MAX = 1024

/** يقرأ الجسم نصاً بسقف: يرفض ما يعلن طولاً أكبر قبل القراءة، ويقطع ما يتجاوزه أثناءها — null عند التجاوز */
export async function readCapped(req: Request, max = BEACON_MAX): Promise<string | null> {
  const declared = Number(req.headers.get('content-length') ?? NaN)
  if (Number.isFinite(declared) && declared > max) return null
  if (!req.body) return ''
  const reader = req.body.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) { await reader.cancel().catch(() => {}); return null }
    parts.push(value)
  }
  const all = new Uint8Array(size)
  let at = 0
  for (const p of parts) { all.set(p, at); at += p.byteLength }
  return new TextDecoder().decode(all)
}
