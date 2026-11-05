import 'server-only'
/* حدّ محاولات بسيط في الذاكرة لكل عنوان — يكفي لعملية واحدة؛ في النشر يُستبدل بـ KV. */
import { headers } from 'next/headers'

const hits = new Map<string, { n: number; reset: number }>()

export async function limited(bucket: string, max: number, windowMs: number): Promise<boolean> {
  const h = await headers()
  const ip = h.get('cf-connecting-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
  const key = `${bucket}:${ip}`
  const now = Date.now()
  const cur = hits.get(key)
  if (!cur || cur.reset < now) {
    hits.set(key, { n: 1, reset: now + windowMs })
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k)
    return false
  }
  cur.n++
  return cur.n > max
}
