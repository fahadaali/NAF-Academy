/* يقدّم الوسائط المرفوعة تدفّقاً من التخزين (لا يُحمَّل الملف كاملاً في الذاكرة).
   مفتاح الرفع فريد لكل ملف فلا يتغيّر محتواه ← تخزين مؤقت دائم. أما حزمة الهوية فمفاتيحها ثابتة (`brand-*`)
   ويُعاد كتابتها مع كل إصدار للحزمة ← تخزين قصير بإعادة تحقق (ETag). */
import { getObjectStream } from '@/server/storage'
import { mediaByKey } from '@/server/queries'

const LONG = 'public, max-age=31536000, immutable'
const SHORT = 'public, max-age=3600, must-revalidate'

export async function GET(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params
  const row = await mediaByKey(key)
  if (!row) return new Response('Not found', { status: 404 })
  const headers: Record<string, string> = {
    'content-type': row.mime,
    'cache-control': key.startsWith('brand-') ? SHORT : LONG,
    'x-content-type-options': 'nosniff',
    /* SVG نُقّي عند الرفع؛ ومع ذلك لا يُنفَّذ فيه شيء لو فُتح مباشرة */
    ...(row.mime === 'image/svg+xml' ? { 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" } : {}),
  }
  const obj = await getObjectStream(key)
  if (!obj) return new Response('Not found', { status: 404 })
  if (obj.etag) {
    headers.etag = obj.etag
    if (req.headers.get('if-none-match') === obj.etag) {
      await obj.body.cancel().catch(() => {})
      return new Response(null, { status: 304, headers })
    }
  }
  if (obj.size != null) headers['content-length'] = String(obj.size)
  return new Response(obj.body, { headers })
}
