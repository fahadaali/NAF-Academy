/* يقدّم الوسائط المرفوعة. المفتاح فريد لكل رفع، فالتخزين المؤقت دائم. */
import { getObject } from '@/server/storage'
import { mediaByKey } from '@/server/queries'

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params
  const row = await mediaByKey(key)
  if (!row) return new Response('Not found', { status: 404 })
  const bytes = await getObject(key)
  if (!bytes) return new Response('Not found', { status: 404 })
  return new Response(bytes as BodyInit, {
    headers: {
      'content-type': row.mime,
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  })
}
