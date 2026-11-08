import type { MetadataRoute } from 'next'
import { siteUrl } from '@/server/site'

/* المحتوى العام يُفهرس، والخاص لا (حسابي، اللوحة، الطلبات، الملفات، الدفع) */
export default function robots(): MetadataRoute.Robots {
  const site = siteUrl()
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/api', '/auth', '/learn', '/learn-go', '/files', '/orders', '/login', '/invite', '/unsubscribe', '/offline', '/courses/*/enroll', '/courses/*/preview'] }],
    /* رابط الخريطة مطلق فقط — بلا SITE_URL لا يُذكر بدل رابط غير صالح */
    ...(site ? { sitemap: `${site}/sitemap.xml`, host: site } : {}),
  }
}
