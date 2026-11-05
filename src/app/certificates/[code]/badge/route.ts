/* Open Badges 2.0 — الإثبات المستضاف (Assertion). البريد مجزّأ بملح فلا يُكشف. الملغاة تُعلن ملغاة. */
import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { certificateByCode } from '@/server/certificates'
import { db, schema as s } from '@/server/db'
import { siteUrl } from '@/server/site'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const r = await certificateByCode((await ctx.params).code)
  const site = siteUrl()
  if (!r || !r.c.code || !site || (r.c.status !== 'issued' && r.c.status !== 'revoked')) return new Response('Not found', { status: 404 })
  const [l] = await db.select({ email: s.learners.email }).from(s.learners).where(eq(s.learners.id, r.c.learnerId))
  const salt = r.c.id.slice(0, 8)
  const body = {
    '@context': 'https://w3id.org/openbadges/v2', type: 'Assertion', id: `${site}/certificates/${r.c.code}/badge`,
    recipient: { type: 'email', hashed: true, salt, identity: `sha256$${createHash('sha256').update((l?.email ?? '') + salt).digest('hex')}` },
    badge: `${site}/badges/${r.slug}`, issuedOn: r.c.issuedAt, verification: { type: 'hosted' },
    evidence: `${site}/certificates/${r.c.code}`,
    ...(r.c.status === 'revoked' ? { revoked: true, revocationReason: r.c.reason || 'ملغاة' } : {}),
  }
  return Response.json(body, { headers: { 'content-type': 'application/ld+json' } })
}
