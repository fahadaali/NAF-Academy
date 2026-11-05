import 'server-only'
/* تذكرة الحضور: رمز موقّع (التسجيل + الجلسة) يُعرض QR، ويمسحه الفريق عند الباب. لا يُخزَّن شيء. */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { envVar } from './runtime'

const key = () => {
  const v = envVar('LEARNER_SECRET')
  if (v && v.length >= 32) return v
  if (process.env.NODE_ENV === 'production') throw new Error('LEARNER_SECRET missing')
  return 'dev-learner-secret-dev-learner-secret'
}
const mac = (p: string) => createHmac('sha256', key()).update(`ticket:${p}`).digest('base64url').slice(0, 22)

export function ticketToken(learnerId: string, lessonId: string) {
  const p = `${learnerId}.${lessonId}`
  return `${Buffer.from(p).toString('base64url')}.${mac(p)}`
}

export function readTicket(token: string): { learnerId: string; lessonId: string } | null {
  const [b, m] = token.split('.')
  if (!b || !m) return null
  const p = Buffer.from(b, 'base64url').toString()
  const want = Buffer.from(mac(p))
  const got = Buffer.from(m)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  const [learnerId, lessonId] = p.split('.')
  return learnerId && lessonId ? { learnerId, lessonId } : null
}
