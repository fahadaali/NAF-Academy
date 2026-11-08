/* عدّاد الزيارات — يستقبل المسار فقط، بلا ملفات تعريف ولا عنوان ولا هوية، ويجمع يومياً بتوقيت الرياض. */
import { and, isNull, sql } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { inList } from '@/server/db/limits'
import { classify, isBot, keepKnown, readCapped, slugsOf } from '@/lib/stats-path'
import { limited } from '@/server/ratelimit'

export const dynamic = 'force-dynamic'

const day = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10)

export async function POST(req: Request) {
  if (isBot(req.headers.get('user-agent') ?? '') || req.headers.get('sec-gpc') === '1' || req.headers.get('dnt') === '1') return new Response(null, { status: 204 })
  if (await limited('beacon', 120, 10 * 60e3)) return new Response(null, { status: 204 })
  /* الجسم مسار واحد: ما يتجاوز السقف يُرفض دون أن يُقرأ كاملاً */
  const body = await readCapped(req)
  if (body === null) return new Response(null, { status: 413 })
  let hits = classify(body.slice(0, 220))
  /* رابط الدورة يُعدّ لدورة موجودة فقط — استعلام صغير واحد، ولا شيء حين لا رابط */
  const slugs = slugsOf(hits)
  if (slugs.length) {
    const found = await db.select({ slug: s.courses.slug }).from(s.courses).where(and(inList(s.courses.slug, slugs), isNull(s.courses.deletedAt)))
    const known = new Set(found.map((r) => r.slug))
    hits = keepKnown(hits, (x) => known.has(x))
  }
  const d = day()
  for (const h of hits)
    await db.insert(s.statsDaily).values({ day: d, metric: h.metric, key: h.key, n: 1 })
      .onConflictDoUpdate({ target: [s.statsDaily.day, s.statsDaily.metric, s.statsDaily.key], set: { n: sql`${s.statsDaily.n} + 1` } })
  return new Response(null, { status: 204 })
}
