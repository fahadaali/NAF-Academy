/* عدّاد الزيارات — يستقبل المسار فقط، بلا ملفات تعريف ولا عنوان ولا هوية، ويجمع يومياً بتوقيت الرياض. */
import { sql } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { classify, isBot } from '@/lib/stats-path'
import { limited } from '@/server/ratelimit'

export const dynamic = 'force-dynamic'

const day = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10)

export async function POST(req: Request) {
  if (isBot(req.headers.get('user-agent') ?? '') || req.headers.get('sec-gpc') === '1' || req.headers.get('dnt') === '1') return new Response(null, { status: 204 })
  if (await limited('beacon', 120, 10 * 60e3)) return new Response(null, { status: 204 })
  const path = (await req.text()).slice(0, 220)
  const hits = classify(path)
  const d = day()
  for (const h of hits)
    await db.insert(s.statsDaily).values({ day: d, metric: h.metric, key: h.key, n: 1 })
      .onConflictDoUpdate({ target: [s.statsDaily.day, s.statsDaily.metric, s.statsDaily.key], set: { n: sql`${s.statsDaily.n} + 1` } })
  return new Response(null, { status: 204 })
}
