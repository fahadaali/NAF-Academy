import 'server-only'
/* إجراءات حسابات الفريق: الدخول بخطوتيه، وروابط الدعوة وإعادة التعيين الموقّعة، والتحقق الثنائي.
   القفل بعد المحاولات الخاطئة في القاعدة (يصمد عبر نسخ العامل)، والحدّ لكل عنوان من limited(). */
import { and, count, eq, isNotNull, sql } from 'drizzle-orm'
import { db, schema as s } from './db'
import { authSecret, createSession, createStep, pendingStep } from './auth'
import { siteUrl } from './site'
import { emailBrand } from './brand'
import { channelOpen, send } from './notify/channels'
import { renderEmail } from './notify/templates'
import {
  hashPassword, lockAfter, newTotpSecret, otpauthUri, passwordProblem, readToken, signToken, verifyPassword, verifyTotp,
} from '@/lib/staff-crypto'
import type { MemberRow } from './db/schema'

const now = () => Math.floor(Date.now() / 1000)
/* تجزيء ثابت لبريد غير موجود: الزمن نفسه فلا يُستدلّ على وجود الحساب */
let dummy: Promise<string> | null = null
const dummyHash = () => (dummy ??= hashPassword('not-a-real-password-placeholder'))

export const normEmail = (e: string) => e.trim().toLowerCase()

export async function memberByEmail(email: string): Promise<MemberRow | undefined> {
  const [m] = await db.select().from(s.members).where(eq(s.members.email, normEmail(email)))
  return m
}

export type LoginResult = { ok: true; next: 'panel' | '2fa' } | { ok: false; error: string }

const WRONG = 'البريد أو كلمة المرور غير صحيحة'

export async function loginWithPassword(email: string, password: string): Promise<LoginResult> {
  const m = await memberByEmail(email)
  if (!m || !m.passwordHash) {
    await verifyPassword(password, await dummyHash())
    return { ok: false, error: WRONG }
  }
  if (m.lockedUntil && m.lockedUntil > now()) {
    const mins = Math.ceil((m.lockedUntil - now()) / 60)
    return { ok: false, error: `محاولات خاطئة كثيرة — الحساب مقفل ${mins} دقيقة` }
  }
  if (!(await verifyPassword(password, m.passwordHash))) {
    const failures = m.failedLogins + 1
    await db.update(s.members).set({ failedLogins: failures, lockedUntil: lockAfter(failures, Date.now()) }).where(eq(s.members.userId, m.userId))
    return { ok: false, error: WRONG }
  }
  if (!m.isActive) return { ok: false, error: 'هذا الحساب موقوف — تواصل مع مالك المنصة' }
  await db.update(s.members).set({ failedLogins: 0, lockedUntil: null }).where(eq(s.members.userId, m.userId))
  if (m.totpEnabledAt && m.totpSecret) {
    await createStep(m.userId, m.sessionVersion)
    return { ok: true, next: '2fa' }
  }
  await createSession(m.userId, m.sessionVersion)
  return { ok: true, next: 'panel' }
}

/** الخطوة الثانية: رمز تطبيق المصادقة */
export async function finishSecondStep(code: string): Promise<{ ok: boolean; error?: string }> {
  const p = await pendingStep()
  if (!p) return { ok: false, error: 'انتهت مهلة الخطوة — ادخل بكلمة المرور من جديد' }
  const [m] = await db.select().from(s.members).where(eq(s.members.userId, p.userId))
  if (!m || !m.isActive || m.sessionVersion !== p.version || !m.totpSecret || !m.totpEnabledAt) return { ok: false, error: 'ادخل بكلمة المرور من جديد' }
  if (m.lockedUntil && m.lockedUntil > now()) return { ok: false, error: 'محاولات خاطئة كثيرة — انتظر قليلاً' }
  const step = await verifyTotp(m.totpSecret, code, Date.now(), m.totpLastStep)
  if (step === null) {
    const failures = m.failedLogins + 1
    await db.update(s.members).set({ failedLogins: failures, lockedUntil: lockAfter(failures, Date.now()) }).where(eq(s.members.userId, m.userId))
    return { ok: false, error: 'رمز غير صحيح' }
  }
  /* الخطوة لا تُقبل مرتين: الشرط في التحديث نفسه */
  const [used] = await db.update(s.members).set({ totpLastStep: step, failedLogins: 0, lockedUntil: null })
    .where(and(eq(s.members.userId, m.userId), sql`coalesce(${s.members.totpLastStep}, -1) < ${step}`)).returning()
  if (!used) return { ok: false, error: 'استُخدم هذا الرمز — انتظر الرمز التالي' }
  await createSession(m.userId, m.sessionVersion)
  return { ok: true }
}

/* — روابط تعيين كلمة المرور (دعوة أو إعادة تعيين) — */
type LinkToken = { k: 'staff-pw'; u: string; v: number; p: 'invite' | 'reset'; exp: number }
const LINK_HOURS = { invite: 72, reset: 2 } as const

/** رابط موقّع مرتبط بنسخة الحساب: يسقط بمجرد تعيين كلمة المرور (أو أي تعيين أحدث) */
export async function passwordLink(m: Pick<MemberRow, 'userId' | 'sessionVersion'>, purpose: 'invite' | 'reset'): Promise<string> {
  const t = await signToken({ k: 'staff-pw', u: m.userId, v: m.sessionVersion, p: purpose, exp: now() + LINK_HOURS[purpose] * 3600 }, authSecret())
  return `${siteUrl() ?? ''}/admin/set-password?t=${encodeURIComponent(t)}`
}

export async function linkTarget(token: string): Promise<{ member: MemberRow; purpose: 'invite' | 'reset' } | null> {
  const t = await readToken<LinkToken>(token, authSecret(), 'staff-pw')
  if (!t) return null
  const [m] = await db.select().from(s.members).where(eq(s.members.userId, t.u))
  if (!m || !m.isActive || m.sessionVersion !== t.v) return null
  return { member: m, purpose: t.p }
}

/** يعيّن كلمة المرور، ويرفع النسخة (يُبطل كل جلسة ورابط سابق)، ويُدخل صاحبها */
export async function setPasswordWithLink(token: string, password: string): Promise<{ ok: boolean; error?: string; twoStep?: boolean }> {
  const target = await linkTarget(token)
  if (!target) return { ok: false, error: 'الرابط منتهٍ أو استُخدم — اطلب رابطاً جديداً من مالك المنصة' }
  const m = target.member
  const problem = passwordProblem(password, m.email ?? '')
  if (problem) return { ok: false, error: problem }
  const version = m.sessionVersion + 1
  const [done] = await db.update(s.members)
    .set({ passwordHash: await hashPassword(password), passwordSetAt: now(), sessionVersion: version, failedLogins: 0, lockedUntil: null })
    .where(and(eq(s.members.userId, m.userId), eq(s.members.sessionVersion, m.sessionVersion))).returning()
  if (!done) return { ok: false, error: 'الرابط استُخدم للتو' }
  await db.insert(s.auditLog).values({ actor: m.displayName || m.email || m.userId, action: target.purpose === 'invite' ? 'accept-invite' : 'reset-password', entity: 'member', entityId: m.email ?? m.userId, summary: 'تعيين كلمة المرور' })
  if (done.totpEnabledAt && done.totpSecret) {
    await createStep(done.userId, version)
    return { ok: true, twoStep: true }
  }
  await createSession(done.userId, version)
  return { ok: true }
}

export async function changeOwnPassword(userId: string, current: string, next: string): Promise<{ ok: boolean; error?: string }> {
  const [m] = await db.select().from(s.members).where(eq(s.members.userId, userId))
  if (!m || !(await verifyPassword(current, m.passwordHash))) return { ok: false, error: 'كلمة المرور الحالية غير صحيحة' }
  const problem = passwordProblem(next, m.email ?? '')
  if (problem) return { ok: false, error: problem }
  const version = m.sessionVersion + 1
  await db.update(s.members).set({ passwordHash: await hashPassword(next), passwordSetAt: now(), sessionVersion: version }).where(eq(s.members.userId, userId))
  /* الجلسات الأخرى تسقط، وهذه تبقى بالنسخة الجديدة */
  await createSession(userId, version)
  return { ok: true }
}

/** «نسيت كلمة المرور»: رابط بالبريد إن كانت قناة البريد مفتوحة — والجواب واحد سواء وُجد الحساب أم لا */
export async function sendResetEmail(email: string): Promise<{ ok: boolean; mail: boolean }> {
  if (!(await channelOpen('email'))) return { ok: true, mail: false }
  const m = await memberByEmail(email)
  if (!m || !m.isActive || !m.email) return { ok: true, mail: true }
  const site = siteUrl() ?? ''
  const brand = await emailBrand(site)
  const link = await passwordLink(m, 'reset')
  const parts = renderEmail({
    site, brand, heading: 'إعادة تعيين كلمة المرور',
    body: `طُلبت إعادة تعيين كلمة مرور حسابك في لوحة ${brand.name}.\nالرابط صالح ساعتين ولمرة واحدة.`,
    cta: { label: 'تعيين كلمة مرور جديدة', href: link },
    note: 'إن لم تطلب ذلك فتجاهل هذه الرسالة — كلمة مرورك الحالية تبقى كما هي.',
  })
  await send({ channel: 'email', to: m.email, kind: 'staff-reset', subject: `إعادة تعيين كلمة المرور — ${brand.name}`, text: `${parts.text}\n${link}`, html: parts.html, secret: link })
  return { ok: true, mail: true }
}

/** بريد الدعوة — إن كانت القناة مفتوحة؛ وإلا يبقى الرابط في «الفريق» للنسخ */
export async function sendInviteEmail(m: MemberRow, link: string, by: string): Promise<boolean> {
  if (!m.email || !(await channelOpen('email'))) return false
  const site = siteUrl() ?? ''
  const brand = await emailBrand(site)
  const parts = renderEmail({
    site, brand, heading: `دعوة إلى لوحة ${brand.name}`,
    body: `دعاك ${by} إلى فريق لوحة ${brand.name}.\nعيّن كلمة مرورك من الرابط، ثم ادخل ببريدك من صفحة دخول اللوحة.\nالرابط صالح ثلاثة أيام.`,
    cta: { label: 'تعيين كلمة المرور', href: link },
  })
  const r = await send({ channel: 'email', to: m.email, kind: 'staff-invite', subject: `دعوة إلى لوحة ${brand.name}`, text: `${parts.text}\n${link}`, html: parts.html, secret: link })
  return r.ok
}

/* — التحقق الثنائي — */
/** بدء التفعيل: سرّ جديد غير مفعّل بعد، ورابط otpauth للمسح */
export async function beginTotp(userId: string, issuer: string): Promise<{ secret: string; uri: string } | null> {
  const [m] = await db.select().from(s.members).where(eq(s.members.userId, userId))
  if (!m || m.totpEnabledAt) return null
  const secret = newTotpSecret()
  await db.update(s.members).set({ totpSecret: secret, totpLastStep: null }).where(eq(s.members.userId, userId))
  return { secret, uri: otpauthUri(secret, m.email ?? userId, issuer) }
}

export async function confirmTotp(userId: string, code: string): Promise<{ ok: boolean; error?: string }> {
  const [m] = await db.select().from(s.members).where(eq(s.members.userId, userId))
  if (!m?.totpSecret || m.totpEnabledAt) return { ok: false, error: 'ابدأ التفعيل من جديد' }
  const step = await verifyTotp(m.totpSecret, code, Date.now(), null)
  if (step === null) return { ok: false, error: 'الرمز غير صحيح — تأكد من وقت الجهاز وأعد المحاولة' }
  await db.update(s.members).set({ totpEnabledAt: now(), totpLastStep: step }).where(eq(s.members.userId, userId))
  return { ok: true }
}

export async function disableTotp(userId: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const [m] = await db.select().from(s.members).where(eq(s.members.userId, userId))
  if (!m || !(await verifyPassword(password, m.passwordHash))) return { ok: false, error: 'كلمة المرور غير صحيحة' }
  await db.update(s.members).set({ totpSecret: null, totpEnabledAt: null, totpLastStep: null }).where(eq(s.members.userId, userId))
  return { ok: true }
}

/** للمالك من «الفريق» أو من /setup: إلغاء التحقق الثنائي لعضو فقد جهازه — ويُبطل جلساته */
export async function resetMemberTotp(userId: string) {
  await db.update(s.members).set({ totpSecret: null, totpEnabledAt: null, totpLastStep: null, sessionVersion: sql`${s.members.sessionVersion} + 1` }).where(eq(s.members.userId, userId))
}

/** يرفع النسخة: تسقط كل جلساته وروابطه (عند الإيقاف أو إصدار رابط إعادة تعيين) */
export async function revokeSessions(userId: string) {
  const [m] = await db.update(s.members).set({ sessionVersion: sql`${s.members.sessionVersion} + 1` }).where(eq(s.members.userId, userId)).returning()
  return m
}

/** للوحة «الفريق»: من فعّل التحقق الثنائي */
export async function twoStepCount() {
  const [r] = await db.select({ n: count() }).from(s.members).where(and(isNotNull(s.members.totpEnabledAt), eq(s.members.isActive, 1)))
  return r.n
}
