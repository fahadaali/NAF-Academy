/* توقيع أحداث Resend (معيار Svix): HMAC-SHA256 بالسرّ (whsec_ بترميز base64) على "id.timestamp.body"،
   والترويسة قد تحمل عدة توقيعات «v1,…» مفصولة بمسافة. ويُرفض ما مضى عليه أكثر من خمس دقائق. */
import { createHmac, timingSafeEqual } from 'node:crypto'

export function svixSign(secret: string, id: string, ts: string, body: string) {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  return createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64')
}

export function verifySvix(secret: string, h: { id: string | null; ts: string | null; sig: string | null }, body: string, now = Date.now()): boolean {
  if (!secret || !h.id || !h.ts || !h.sig) return false
  const t = Number(h.ts)
  if (!Number.isFinite(t) || Math.abs(now - t * 1000) > 5 * 60e3) return false
  const want = Buffer.from(svixSign(secret, h.id, h.ts, body))
  return h.sig.split(' ').some((p) => {
    const got = Buffer.from(p.replace(/^v1,/, ''))
    return got.length === want.length && timingSafeEqual(got, want)
  })
}

export type MailEvent = 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | null
/** نوع الحدث ← ما نسجّله. الارتداد المؤقت لا يُكتم */
export function mailEvent(type: string, bounceType?: string): MailEvent {
  switch (type) {
    case 'email.delivered': return 'delivered'
    case 'email.opened': return 'opened'
    case 'email.clicked': return 'clicked'
    case 'email.complained': return 'complained'
    case 'email.bounced': return bounceType && /transient|temporary|soft/i.test(bounceType) ? null : 'bounced'
    default: return null
  }
}
