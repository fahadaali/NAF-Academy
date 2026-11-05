import 'server-only'
/* إلغاء الاشتراك في الرسائل الاختيارية — رابط موقّع بالبريد، بلا دخول، بنقرة واحدة. */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db, schema as s } from '../db'
import { envVar } from '../runtime'

const key = () => {
  const v = envVar('LEARNER_SECRET')
  if (v && v.length >= 32) return v
  if (process.env.NODE_ENV === 'production') throw new Error('LEARNER_SECRET missing')
  return 'dev-learner-secret-dev-learner-secret'
}
const mac = (email: string) => createHmac('sha256', key()).update(`optout:${email}`).digest('base64url').slice(0, 22)

export function optoutToken(email: string) {
  const e = email.trim().toLowerCase()
  return `${Buffer.from(e).toString('base64url')}.${mac(e)}`
}

export function readOptout(token: string): string | null {
  const [b, m] = String(token).split('.')
  if (!b || !m) return null
  const email = Buffer.from(b, 'base64url').toString()
  const want = Buffer.from(mac(email))
  const got = Buffer.from(m)
  return want.length === got.length && timingSafeEqual(want, got) ? email : null
}

export async function isOptedOut(email: string) {
  const [r] = await db.select().from(s.notifyOptouts).where(eq(s.notifyOptouts.email, email.trim().toLowerCase()))
  return !!r
}

export async function setOptout(email: string, out: boolean) {
  const e = email.trim().toLowerCase()
  if (out) await db.insert(s.notifyOptouts).values({ email: e }).onConflictDoNothing()
  else await db.delete(s.notifyOptouts).where(eq(s.notifyOptouts.email, e))
}
