/* الفيديو التشويقي — رابط Stream موقّع يُصدر عند الطلب (صفحة الدورة مخزّنة مؤقتاً فلا تحمل رمزاً منتهياً).
   للدورة الظاهرة للعموم، أو لمن يحمل رمز معاينتها (?t=)؛ وللرابط المباشر تحويل إليه. */
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { isPublic, liveStatus } from '@/lib/course-meta'
import { playbackUrl } from '@/server/stream'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const [c] = await db.select({ status: s.courses.status, visibility: s.courses.visibility, publishAt: s.courses.publishAt, teaser: s.courses.teaser, token: s.courses.previewToken }).from(s.courses)
    .where(and(eq(s.courses.slug, (await ctx.params).slug), isNull(s.courses.deletedAt)))
  const t = new URL(req.url).searchParams.get('t')
  const visible = c && ((c.visibility === 'public' && isPublic(liveStatus(c.status, c.publishAt))) || (!!t && t === c.token))
  if (!c || !visible || c.teaser.provider === 'none') return new Response('Not found', { status: 404 })
  const src = c.teaser.provider === 'stream' ? await playbackUrl(c.teaser.uid) : c.teaser.url
  if (!src) return new Response('الفيديو غير متاح الآن', { status: 503 })
  return Response.redirect(src.replace('preload=metadata', 'autoplay=true'), 302)
}
