import 'server-only'
/* تقديم ملف خاص بعد التحقق من الحق فيه — مشترك بين مسار المتدرب ومسار الفريق */
import { eq } from 'drizzle-orm'
import { db, schema as s } from './db'
import { getObject } from './storage'

export async function assetRow(id: string) {
  const [a] = await db.select().from(s.assets).where(eq(s.assets.id, id))
  return a ?? null
}

/** inline: لعارض السلايدات داخل الصفحة — وإلا تنزيل */
export async function serveAsset(a: NonNullable<Awaited<ReturnType<typeof assetRow>>>, o: { inline?: boolean } = {}) {
  const bytes = await getObject(a.key)
  if (!bytes) return new Response('Not found', { status: 404 })
  return new Response(bytes as BodyInit, {
    headers: {
      'content-type': a.mime, 'cache-control': 'private, max-age=300', 'x-content-type-options': 'nosniff',
      'content-disposition': `${o.inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.name)}`,
    },
  })
}
