/* أحداث البريد من Resend — التسليم والفتح والنقر والارتداد والشكوى، تُربط بسجل الرسائل بمعرّف المزوّد.
   الارتداد الدائم والشكوى يكتمان العنوان. مقفل بلا RESEND_WEBHOOK_SECRET. */
import { eq, sql } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { envVar } from '@/server/runtime'
import { mailEvent, verifySvix } from '@/lib/svix'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const secret = envVar('RESEND_WEBHOOK_SECRET') ?? ''
  if (!secret) return new Response('Not found', { status: 404 })
  const body = await req.text()
  const ok = verifySvix(secret, { id: req.headers.get('svix-id'), ts: req.headers.get('svix-timestamp'), sig: req.headers.get('svix-signature') }, body)
  if (!ok) return new Response('Bad signature', { status: 401 })
  let j: { type?: string; created_at?: string; data?: { email_id?: string; to?: string[]; bounce?: { type?: string } } }
  try { j = JSON.parse(body) } catch { return new Response('Bad request', { status: 400 }) }
  const ev = mailEvent(j.type ?? '', j.data?.bounce?.type)
  const pid = j.data?.email_id
  if (!ev || !pid) return Response.json({ ok: true, ignored: true })
  const at = j.created_at && !Number.isNaN(Date.parse(j.created_at)) ? new Date(j.created_at).toISOString() : new Date().toISOString()
  const col = { delivered: 'deliveredAt', opened: 'openedAt', clicked: 'clickedAt', bounced: 'bouncedAt', complained: 'complainedAt' } as const
  /* أول وقت يبقى؛ والفتحات تُعدّ */
  await db.update(s.messageLog).set({
    [col[ev]]: sql`coalesce(${s.messageLog[col[ev]]}, ${at})`,
    ...(ev === 'opened' ? { opens: sql`${s.messageLog.opens} + 1` } : {}),
    ...(ev === 'bounced' ? { status: 'bounced' } : {}),
  }).where(eq(s.messageLog.providerId, pid))
  if (ev === 'bounced' || ev === 'complained') {
    for (const to of j.data?.to ?? []) {
      const email = String(to).trim().toLowerCase()
      if (email) await db.insert(s.mailSuppressions).values({ email, reason: ev === 'bounced' ? 'bounce' : 'complaint' }).onConflictDoNothing()
    }
  }
  return Response.json({ ok: true })
}
