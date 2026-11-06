import 'server-only'
/* دخول فريق اللوحة — مستقل تماماً عن أي هوية خارجية.
   لكل عضو حسابه في جدول members: بريد + كلمة مرور (PBKDF2) + تحقق ثنائي اختياري (TOTP).
   الجلسة رمز موقّع HMAC في كوكي httpOnly يحمل رقم نسخة الحساب (sessionVersion):
   تغيير كلمة المرور أو الإيقاف أو إعادة التعيين يرفع الرقم فتسقط كل الجلسات والروابط القديمة.
   المنطق المشفّر في src/lib/staff-crypto.ts، والإجراءات (الدخول، الدعوة، إعادة التعيين) في src/server/staff-auth.ts. */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, schema as s } from './db'
import { can, isRole, type Perm, type Role } from '@/lib/permissions'
import { readToken, signToken } from '@/lib/staff-crypto'

export const SESSION_COOKIE = 'naf_academy_admin'
export const STEP_COOKIE = 'naf_academy_2fa'
const TTL = 60 * 60 * 12 // 12 ساعة
const STEP_TTL = 60 * 5 // خمس دقائق لإدخال رمز التحقق الثنائي

/** سرّ التوقيع — ADMIN_SECRET (32 حرفاً على الأقل) في الإنتاج */
export function authSecret() {
  const v = process.env.ADMIN_SECRET
  if (v && v.length >= 32) return v
  if (process.env.NODE_ENV === 'production') throw new Error('ADMIN_SECRET missing')
  return 'dev-only-secret-dev-only-secret-0000'
}

/** عضو الفريق في هذا الطلب */
export type Staff = { id: string; name: string; email: string; role: Role; perms: Record<string, unknown> | null; instructorId: string | null; totp: boolean }

type SessionToken = { k: 'staff'; u: string; v: number; exp: number }
type StepToken = { k: 'staff-2fa'; u: string; v: number; exp: number }

const cookieOpts = (maxAge: number) => ({ httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge })

export async function createSession(userId: string, version: number) {
  const token = await signToken({ k: 'staff', u: userId, v: version, exp: Math.floor(Date.now() / 1000) + TTL }, authSecret())
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, cookieOpts(TTL))
  jar.delete(STEP_COOKIE)
}

/** بعد كلمة مرور صحيحة لحساب مفعّل فيه التحقق الثنائي: خطوة معلّقة قصيرة العمر */
export async function createStep(userId: string, version: number) {
  const token = await signToken({ k: 'staff-2fa', u: userId, v: version, exp: Math.floor(Date.now() / 1000) + STEP_TTL }, authSecret())
  ;(await cookies()).set(STEP_COOKIE, token, { ...cookieOpts(STEP_TTL), path: '/admin' })
}

export async function pendingStep(): Promise<{ userId: string; version: number } | null> {
  const t = await readToken<StepToken>((await cookies()).get(STEP_COOKIE)?.value, authSecret(), 'staff-2fa')
  return t ? { userId: t.u, version: t.v } : null
}

export async function destroySession() {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
  jar.delete({ name: STEP_COOKIE, path: '/admin' })
}

const parsePerms = (x: string | null) => { try { const v = JSON.parse(x ?? 'null'); return v && typeof v === 'object' ? (v as Record<string, unknown>) : null } catch { return null } }

export async function currentStaff(): Promise<Staff | null> {
  const t = await readToken<SessionToken>((await cookies()).get(SESSION_COOKIE)?.value, authSecret(), 'staff')
  if (!t) return null
  const [m] = await db.select().from(s.members).where(eq(s.members.userId, t.u))
  /* الحساب موقوف، أو بلا كلمة مرور، أو تغيّرت نسخته (كلمة مرور جديدة/إعادة تعيين) — الجلسة ساقطة */
  if (!m || !m.isActive || !m.passwordHash || m.sessionVersion !== t.v || !isRole(m.role)) return null
  const now = Math.floor(Date.now() / 1000)
  if (!m.lastSeenAt || now - m.lastSeenAt > 600) await db.update(s.members).set({ lastSeenAt: now }).where(eq(s.members.userId, m.userId)).catch(() => {})
  return { id: m.userId, name: m.displayName || m.email || 'عضو', email: m.email ?? '', role: m.role, perms: m.role === 'owner' ? null : parsePerms(m.perms), instructorId: m.instructorId ?? null, totp: !!m.totpEnabledAt }
}

/** نطاق دورات العضو: المدرب يرى دوراته وحدها (الدورات المسنَدة إلى ملفه)، وغيره كل الدورات (null) */
export async function courseScope(st: Staff): Promise<string[] | null> {
  if (st.role !== 'instructor') return null
  if (!st.instructorId) return []
  const rows = await db.select({ id: s.courseInstructors.courseId }).from(s.courseInstructors).where(eq(s.courseInstructors.instructorId, st.instructorId))
  return rows.map((r) => r.id)
}
export const inScope = (scope: string[] | null, courseId: string) => scope === null || scope.includes(courseId)

/** للوحة: عضو فريق بأي دور — وإلا إلى الدخول */
export async function requireAdmin(): Promise<Staff> {
  const st = await currentStaff()
  if (!st) redirect('/admin/login')
  return st
}

/** لكل صفحة وإجراء: صلاحية محددة. الإجراء الممنوع لا يُنفَّذ، والصفحة تعود للوحة برسالة. */
export async function requirePermission(perm: Perm): Promise<Staff> {
  const st = await requireAdmin()
  if (!can(st.role, perm, st.perms)) redirect(can(st.role, 'content.read', st.perms) ? `/admin?denied=${perm}` : '/denied')
  return st
}

export async function staffCan(perm: Perm): Promise<boolean> {
  const st = await currentStaff()
  return !!st && can(st.role, perm, st.perms)
}
