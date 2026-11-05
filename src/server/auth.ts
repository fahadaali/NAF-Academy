import 'server-only'
/* دخول اللوحة المؤقت — كلمة مرور من البيئة وجلسة موقّعة HMAC في كوكي httpOnly.
   يُستبدل بـ naf-auth (الهوية المركزية) في مرحلة الدخول؛ الواجهة requireAdmin() تبقى كما هي. */
import { cookies, headers } from 'next/headers'
import { eq } from 'drizzle-orm'
import { db, schema as s } from './db'
import { envVar } from './runtime'
import { can, isRole, type Perm, type Role } from '@/lib/permissions'
import { redirect } from 'next/navigation'

const COOKIE = 'naf_academy_admin'
const TTL = 60 * 60 * 12 // 12 ساعة
const enc = new TextEncoder()

function secret() {
  const s = process.env.ADMIN_SECRET
  if (s && s.length >= 32) return s
  if (process.env.NODE_ENV === 'production') throw new Error('ADMIN_SECRET missing')
  return 'dev-only-secret-dev-only-secret-0000'
}

export function adminPassword(): string | null {
  const p = process.env.ADMIN_PASSWORD
  if (p) return p
  return process.env.NODE_ENV === 'production' ? null : 'naf-dev'
}

const b64 = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString('base64url')

async function sign(data: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64(await crypto.subtle.sign('HMAC', key, enc.encode(data)))
}

/** مقارنة بزمن ثابت */
export function safeEqual(a: string, b: string) {
  const x = enc.encode(a)
  const y = enc.encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

export type Admin = { name: string; exp: number }

/** عضو الفريق في هذا الطلب */
export type Staff = { id: string; name: string; email: string; role: Role; perms: Record<string, unknown> | null; mode: StaffMode }
export type StaffMode = 'naf-auth' | 'password'

/** naf-auth متى ضُبط في البيئة؛ وإلا دخول كلمة المرور (التطوير، أو مخرج طوارئ صريح) */
export function staffMode(): StaffMode {
  return envVar('STAFF_AUTH') === 'naf-auth' ? 'naf-auth' : 'password'
}

/* ترويسات الهوية يحقنها الوسيط بعد التحقق، ويمسح ما انتحله المتصفح منها */
export const H_SUB = 'x-naf-sub'
export const H_ROLE = 'x-naf-role'
export const H_PERMS = 'x-naf-perms'

export async function createSession(name: string) {
  const payload = b64(enc.encode(JSON.stringify({ name, exp: Math.floor(Date.now() / 1000) + TTL } satisfies Admin)))
  const value = `${payload}.${await sign(payload)}`
  ;(await cookies()).set(COOKIE, value, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: TTL,
  })
}

export async function destroySession() {
  ;(await cookies()).delete(COOKIE)
}

async function passwordSession(): Promise<Admin | null> {
  const raw = (await cookies()).get(COOKIE)?.value
  if (!raw) return null
  const [payload, mac] = raw.split('.')
  if (!payload || !mac || !safeEqual(mac, await sign(payload))) return null
  try {
    const a = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Admin
    return a.exp > Date.now() / 1000 ? a : null
  } catch {
    return null
  }
}

export async function currentStaff(): Promise<Staff | null> {
  if (staffMode() === 'naf-auth') {
    const h = await headers()
    const sub = h.get(H_SUB)
    const role = h.get(H_ROLE) ?? ''
    if (!sub || !isRole(role)) return null
    let perms: Record<string, unknown> | null = null
    try { perms = JSON.parse(h.get(H_PERMS) ?? 'null') } catch {}
    const [m] = await db.select().from(s.members).where(eq(s.members.userId, sub))
    if (!m || !m.isActive) return null
    return { id: sub, name: m.displayName || m.email || 'عضو', email: m.email ?? '', role, perms, mode: 'naf-auth' }
  }
  const a = await passwordSession()
  return a ? { id: `local:${a.name}`, name: a.name, email: '', role: 'owner', perms: null, mode: 'password' } : null
}

/** للوحة: عضو فريق بأي دور — وإلا إلى الدخول */
export async function requireAdmin(): Promise<Staff> {
  const st = await currentStaff()
  if (!st) {
    /* داخلٌ موثَّق بلا دور صالح أو موقوف: صفحة رفض واضحة — لا إعادة توجيه إلى /admin تدور بلا نهاية */
    if (staffMode() === 'naf-auth') redirect((await headers()).get(H_SUB) ? '/denied?r=pending' : '/admin')
    redirect('/admin/login')
  }
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
