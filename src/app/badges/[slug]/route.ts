/* Open Badges 2.0 — وصف الشارة (BadgeClass) لكل دورة */
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { siteUrl } from '@/server/site'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const slug = (await ctx.params).slug
  const [c] = await db.select().from(s.courses).where(and(eq(s.courses.slug, slug), isNull(s.courses.deletedAt)))
  const site = siteUrl() ?? ''
  if (!c) return new Response('Not found', { status: 404 })
  const title = c.title.replace(/~\d/g, '')
  return Response.json({
    '@context': 'https://w3id.org/openbadges/v2', type: 'BadgeClass', id: `${site}/badges/${slug}`,
    name: title, description: c.subtitle || title, image: `${site}/icon.svg`,
    criteria: { id: `${site}/courses/${slug}`, narrative: 'استيفاء متطلبات الدورة واعتماد الأكاديمية' },
    issuer: `${site}/badges/issuer`,
  }, { headers: { 'content-type': 'application/ld+json' } })
}
