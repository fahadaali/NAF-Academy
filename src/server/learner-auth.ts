import 'server-only'
import { emailBrand } from './brand'
import { siteUrl } from './site'
/* دخول المتدربين برمز لمرة واحدة عبر البريد أو الجوال.
   الرمز 6 أرقام، يُخزَّن تجزيئه HMAC، صالح 10 دقائق، 5 محاولات، و3 إرسالات لكل وجهة في 10 دقائق.
   الجلسة: رمز عشوائي في كوكي httpOnly، والقاعدة تحفظ تجزيئه فقط. */
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { and, count, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm'
import { db, schema as s } from './db'
import { envVar } from './runtime'
import { channelOpen, send, type Channel } from './notify/channels'
import { brandEmail } from './notify/templates'
import { normalizePhone } from '@/lib/phone'
import type { LearnerRow } from './db/schema'

const COOKIE = 'naf_learner'
const SESSION_DAYS = 30
const CODE_TTL = 10 * 60e3
const MAX_ATTEMPTS = 5
const MAX_SENDS = 3

export function learnerSecret() {
  const v = envVar('LEARNER_SECRET')
  if (v && v.length >= 32) return v
  if (process.env.NODE_ENV === 'production') throw new Error('LEARNER_SECRET missing')
  return 'dev-learner-secret-dev-learner-secret'
}
const hashCode = (target: string, code: string) => createHmac('sha256', learnerSecret()).update(`${target}:${code}`).digest('hex')
const sha = (t: string) => createHash('sha256').update(t).digest('hex')
const now = () => new Date().toISOString()


export function normalizeTarget(channel: Channel, raw: string): string | null {
  if (channel === 'email') {
    const e = raw.trim().toLowerCase()
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 160 ? e : null
  }
  return normalizePhone(raw)
}

async function clientIp() {
  const h = await headers()
  return h.get('cf-connecting-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''
}

export async function requestCode(channel: Channel, raw: string): Promise<{ ok: boolean; error?: string; target?: string }> {
  if (!(await channelOpen(channel))) return { ok: false, error: channel === 'email' ? 'الدخول بالبريد غير مفعّل بعد' : 'الدخول بالجوال غير مفعّل بعد' }
  const target = normalizeTarget(channel, raw)
  if (!target) return { ok: false, error: channel === 'email' ? 'بريد غير صالح' : 'رقم جوال غير صالح' }
  if (channel === 'sms') {
    const [l] = await db.select({ id: s.learners.id }).from(s.learners).where(eq(s.learners.phone, target))
    if (!l) return { ok: false, error: 'لا حساب بهذا الجوال بعد — ادخل بالبريد أول مرة، ثم أضف جوالك في ملفك' }
  }
  const since = new Date(Date.now() - 10 * 60e3).toISOString()
  const ip = await clientIp()
  const [byTarget] = await db.select({ n: count() }).from(s.otpCodes).where(and(eq(s.otpCodes.target, target), gt(s.otpCodes.createdAt, since)))
  const [byIp] = ip ? await db.select({ n: count() }).from(s.otpCodes).where(and(eq(s.otpCodes.ip, ip), gt(s.otpCodes.createdAt, since))) : [{ n: 0 }]
  if (byTarget.n >= MAX_SENDS || byIp.n >= 10) return { ok: false, error: 'أُرسل أكثر من رمز — انتظر بضع دقائق' }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  await db.update(s.otpCodes).set({ consumedAt: now() }).where(and(eq(s.otpCodes.target, target), isNull(s.otpCodes.consumedAt)))
  await db.insert(s.otpCodes).values({ id: randomUUID(), channel, target, codeHash: hashCode(target, code), expiresAt: new Date(Date.now() + CODE_TTL).toISOString(), ip })
  const site = siteUrl() ?? ''
  const brand = await emailBrand(site)
  const text = `رمز الدخول إلى ${brand.name}: ${code}\nصالح عشر دقائق. لا تشاركه مع أحد.`
  const r = await send({
    channel, to: target, kind: 'otp', secret: code, text,
    /* الرمز في النص وحده لا في العنوان: العنوان يظهر في إشعارات الجوال وقوائم البريد وسجلات المزوّد */
    subject: channel === 'email' ? `رمز الدخول إلى ${brand.name}` : undefined,
    html: channel === 'email' ? brandEmail({ site, brand, title: 'رمز الدخول', lead: `استخدم هذا الرمز لإكمال الدخول إلى ${brand.name}.`, code, note: 'صالح عشر دقائق. إن لم تطلبه فتجاهل هذه الرسالة.' }) : undefined,
  })
  if (r.suppressed) return { ok: false, error: 'تعذّر إيصال البريد إلى هذا العنوان سابقاً — ادخل برقم الجوال أو تواصل معنا ليُعاد تفعيله' }
  return r.ok ? { ok: true, target } : { ok: false, error: r.error }
}

export async function verifyCode(channel: Channel, raw: string, code: string, name?: string): Promise<{ ok: boolean; error?: string; learner?: LearnerRow }> {
  const target = normalizeTarget(channel, raw)
  if (!target || !/^\d{6}$/.test(code)) return { ok: false, error: 'الرمز 6 أرقام' }
  const [row] = await db.select().from(s.otpCodes)
    .where(and(eq(s.otpCodes.target, target), isNull(s.otpCodes.consumedAt), gt(s.otpCodes.expiresAt, now())))
    .orderBy(desc(s.otpCodes.createdAt)).limit(1)
  if (!row) return { ok: false, error: 'انتهت صلاحية الرمز — اطلب رمزاً جديداً' }
  /* المحاولة تُحتسب قبل المقارنة وذرّياً */
  const [tried] = await db.update(s.otpCodes).set({ attempts: sql`${s.otpCodes.attempts} + 1` })
    .where(and(eq(s.otpCodes.id, row.id), lt(s.otpCodes.attempts, MAX_ATTEMPTS), isNull(s.otpCodes.consumedAt))).returning()
  if (!tried) return { ok: false, error: 'محاولات كثيرة — اطلب رمزاً جديداً' }
  const a = Buffer.from(hashCode(target, code))
  const b = Buffer.from(row.codeHash)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    const left = MAX_ATTEMPTS - tried.attempts
    return { ok: false, error: left > 0 ? `رمز غير صحيح — بقي ${left} محاولات` : 'محاولات كثيرة — اطلب رمزاً جديداً' }
  }
  const [used] = await db.update(s.otpCodes).set({ consumedAt: now() }).where(and(eq(s.otpCodes.id, row.id), isNull(s.otpCodes.consumedAt))).returning()
  if (!used) return { ok: false, error: 'استُخدم هذا الرمز من قبل' }

  let learner: LearnerRow | undefined
  if (channel === 'email') {
    ;[learner] = await db.insert(s.learners).values({ id: randomUUID(), email: target, name: name?.trim() || target.split('@')[0] })
      .onConflictDoUpdate({ target: s.learners.email, set: { updatedAt: now() } }).returning()
  } else {
    ;[learner] = await db.select().from(s.learners).where(eq(s.learners.phone, target))
  }
  if (!learner) return { ok: false, error: 'لا حساب بهذه البيانات' }
  await startSession(learner.id, learner.name)
  return { ok: true, learner }
}

export async function startSession(learnerId: string, name = '') {
  const token = randomBytes(32).toString('base64url')
  const h = await headers()
  const exp = new Date(Date.now() + SESSION_DAYS * 864e5)
  await db.insert(s.learnerSessions).values({ id: sha(token), learnerId, expiresAt: exp.toISOString(), lastSeenAt: now(), userAgent: (h.get('user-agent') ?? '').slice(0, 200) })
  const jar = await cookies()
  jar.set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', expires: exp })
  jar.set('naf_hi', (name.split(/[\s@]/)[0] || 'حسابي').slice(0, 30), { sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', expires: exp })
}

export async function currentLearner(): Promise<LearnerRow | null> {
  const token = (await cookies()).get(COOKIE)?.value
  if (!token || token.length > 100) return null
  const [row] = await db.select({ l: s.learners, sess: s.learnerSessions }).from(s.learnerSessions)
    .innerJoin(s.learners, eq(s.learners.id, s.learnerSessions.learnerId))
    .where(and(eq(s.learnerSessions.id, sha(token)), gt(s.learnerSessions.expiresAt, now())))
  if (!row) return null
  if (Date.now() - Date.parse(row.sess.lastSeenAt) > 3600e3)
    await db.update(s.learnerSessions).set({ lastSeenAt: now() }).where(eq(s.learnerSessions.id, row.sess.id))
  return row.l
}

export async function endSession(all = false) {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (token) {
    const [sess] = await db.select().from(s.learnerSessions).where(eq(s.learnerSessions.id, sha(token)))
    if (sess) await db.delete(s.learnerSessions).where(all ? eq(s.learnerSessions.learnerId, sess.learnerId) : eq(s.learnerSessions.id, sess.id))
  }
  jar.delete(COOKIE)
  jar.delete('naf_hi')
}

/** مسار عودة آمن: يبدأ بشرطة واحدة، بلا شرطتين ولا شرطة عكسية ولا نقطتين رأسيتين */
export function safeNext(n: unknown): string {
  const v = typeof n === 'string' ? n : ''
  return /^\/(?![/\\])[^:\s]*$/.test(v) ? v : '/learn'
}
