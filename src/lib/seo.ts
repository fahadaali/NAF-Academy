/* بيانات schema.org المنظّمة — دوال نقية مختبرة تبني JSON-LD للصفحات العامة. */

const ORG_NAME = 'أكاديمية ناف'

export function organization(site: string, b: { name: string; companyName: string; logo?: string } = { name: ORG_NAME, companyName: 'شركة ناف القانونية' }) {
  return {
    '@context': 'https://schema.org', '@type': 'EducationalOrganization', '@id': `${site}/#org`, name: b.name,
    url: site, logo: b.logo ? `${site}${b.logo}` : `${site}/icons/icon-512.png`,
    parentOrganization: { '@type': 'Organization', name: b.companyName },
  }
}

export function website(site: string, name = ORG_NAME) {
  return { '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${site}/#site`, url: site, name, inLanguage: 'ar', publisher: { '@id': `${site}/#org` } }
}

export function breadcrumbs(site: string, items: [string, string][]) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${site}${path}` })),
  }
}

const MODE: Record<string, string> = { recorded: 'online', live: 'online', onsite: 'onsite', blended: 'blended' }

export type CourseLd = {
  slug: string; title: string; description: string; image?: string; mode: string; hours: number
  startsAt?: string | null; endsAt?: string | null; city?: string; venue?: string
  price: number; free: boolean; saleEndsAt?: string | null; available: boolean
  instructors: { name: string; slug: string }[]
  rating?: { avg: number; count: number }
  org?: string
}

export function course(site: string, c: CourseLd) {
  const url = `${site}/courses/${c.slug}`
  const instance: Record<string, unknown> = {
    '@type': 'CourseInstance', courseMode: MODE[c.mode] ?? 'online', inLanguage: 'ar',
    ...(c.hours > 0 ? { courseWorkload: `PT${Math.round(c.hours)}H` } : {}),
    ...(c.startsAt ? { startDate: c.startsAt } : {}), ...(c.endsAt ? { endDate: c.endsAt } : {}),
    ...(c.mode === 'onsite' || c.mode === 'blended'
      ? { location: { '@type': 'Place', name: c.venue || c.city || c.org || ORG_NAME, address: { '@type': 'PostalAddress', addressLocality: c.city || 'الرياض', addressCountry: 'SA' } } }
      : {}),
    ...(c.instructors.length ? { instructor: c.instructors.map((p) => ({ '@type': 'Person', name: p.name, url: `${site}/instructors/${p.slug}` })) } : {}),
  }
  return {
    '@context': 'https://schema.org', '@type': 'Course', '@id': `${url}#course`, url, name: c.title, description: c.description || c.title,
    inLanguage: 'ar', ...(c.image ? { image: c.image } : {}),
    provider: { '@type': 'EducationalOrganization', name: c.org ?? ORG_NAME, url: site, '@id': `${site}/#org` },
    offers: {
      '@type': 'Offer', category: c.free ? 'Free' : 'Paid', price: (c.free ? 0 : c.price / 100).toFixed(2), priceCurrency: 'SAR', url: `${url}#enroll`,
      availability: c.available ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
      ...(c.saleEndsAt ? { priceValidUntil: c.saleEndsAt.slice(0, 10) } : {}),
    },
    hasCourseInstance: [instance],
    ...(c.rating && c.rating.count > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: c.rating.avg, ratingCount: c.rating.count, bestRating: 5, worstRating: 1 } } : {}),
  }
}

export function person(site: string, p: { slug: string; name: string; title: string; image?: string }) {
  return {
    '@context': 'https://schema.org', '@type': 'Person', name: p.name, jobTitle: p.title, url: `${site}/instructors/${p.slug}`,
    ...(p.image ? { image: p.image } : {}), worksFor: { '@id': `${site}/#org` },
  }
}

/** للحقن داخل <script type="application/ld+json"> — يمنع إغلاق الوسم من داخل النص */
export const ldJson = (x: unknown) => JSON.stringify(x).replace(/</g, '\\u003c')
