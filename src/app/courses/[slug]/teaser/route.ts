/* الفيديو التشويقي — رابط Stream موقّع يُصدر عند الطلب (صفحة الدورة مخزّنة مؤقتاً فلا تحمل رمزاً منتهياً).
   للدورة الظاهرة للعموم فقط؛ وللرابط المباشر تحويل إليه. */
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { isPublic, liveStatus } from '@/lib/course-meta'
import { playbackUrl } from '@/server/stream'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const [c] = await db.select({ status: s.courses.status, publishAt: s.courses.publishAt, teaser: s.courses.teaser }).from(s.courses)
    .where(and(eq(s.courses.slug, (await ctx.params).slug), isNull(s.courses.deletedAt)))
  if (!c || !isPublic(liveStatus(c.status, c.publishAt)) || c.teaser.provider === 'none') return new Response('Not found', { status: 404 })
  const src = c.teaser.provider === 'stream' ? await playbackUrl(c.teaser.uid) : c.teaser.url
  if (!src) return new Response('الفيديو غير متاح الآن', { status: 503 })
  return Response.redirect(src.replace('preload=metadata', 'autoplay=true'), 302)
}
