import 'server-only'
/* دخول اللوحة المؤقت — كلمة مرور من البيئة وجلسة موقّعة HMAC في كوكي httpOnly.
   يُستبدل بـ naf-auth (الهوية المركزية) في مرحلة الدخول؛ الواجهة requireAdmin() تبقى كما هي. */
import { cookies } from 'next/headers'
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

export async function currentAdmin(): Promise<Admin | null> {
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

/** لكل صفحة وإجراء في اللوحة — يعيد التوجيه لصفحة الدخول إن لم تكن جلسة */
export async function requireAdmin(): Promise<Admin> {
  const a = await currentAdmin()
  if (!a) redirect('/admin/login')
  return a
}
