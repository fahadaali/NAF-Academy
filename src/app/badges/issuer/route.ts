/* Open Badges 2.0 — الجهة المانحة */
import { siteUrl } from '@/server/site'

export const dynamic = 'force-dynamic'

export async function GET() {
  const site = siteUrl() ?? ''
  return Response.json(
    { '@context': 'https://w3id.org/openbadges/v2', type: 'Issuer', id: `${site}/badges/issuer`, name: 'أكاديمية ناف', url: site },
    { headers: { 'content-type': 'application/ld+json' } },
  )
}
