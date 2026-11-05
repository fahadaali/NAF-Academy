/* Open Badges 2.0 — الجهة المانحة */
import { siteUrl } from '@/server/site'
import { brandView } from '@/server/brand'

export const dynamic = 'force-dynamic'

export async function GET() {
  const site = siteUrl() ?? ''
  const b = await brandView()
  return Response.json(
    { '@context': 'https://w3id.org/openbadges/v2', type: 'Issuer', id: `${site}/badges/issuer`, name: b.name, url: site, ...(b.academy.light ?? b.academy.dark ? { image: `${site}${(b.academy.light ?? b.academy.dark)!.url}` } : {}) },
    { headers: { 'content-type': 'application/ld+json' } },
  )
}
