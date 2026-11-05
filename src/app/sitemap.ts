import type { MetadataRoute } from 'next'
import { catalog } from '@/server/queries'
import { siteUrl } from '@/server/site'

export const revalidate = 3600

/* الصفحات العامة وحدها — الدورات الظاهرة للعموم والمسارات المرئية والمدربون */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = siteUrl() ?? ''
  const { courses, tracks, instructors, rows } = await catalog()
  const updated = new Map(rows.map((r) => [r.row.slug, r.row.updatedAt]))
  return [
    { url: `${site}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${site}/courses`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${site}/tracks`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${site}/certificates/verify`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${site}/policies`, changeFrequency: 'yearly', priority: 0.2 },
    ...courses.map((c) => ({ url: `${site}/courses/${c.slug}`, lastModified: updated.get(c.slug), changeFrequency: 'weekly' as const, priority: c.status === 'open' ? 0.9 : 0.6 })),
    ...tracks.map((t) => ({ url: `${site}/tracks/${t.slug}`, changeFrequency: 'weekly' as const, priority: 0.7 })),
    ...instructors.filter((p) => p.display !== 'hidden').map((p) => ({ url: `${site}/instructors/${p.slug}`, changeFrequency: 'monthly' as const, priority: 0.5 })),
  ]
}
