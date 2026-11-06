/* أدوات دخول الفريق — دوال نقية على WebCrypto وحده (Workers وNode سواء)، تُختبر بلا قاعدة:
   تجزيء كلمة المرور (PBKDF2-SHA256)، والتحقق الثنائي TOTP (RFC 6238)، والروابط والجلسات الموقّعة (HMAC-SHA256). */

const enc = new TextEncoder()
const dec = new TextDecoder()

/* — Base64url — */
export function b64u(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export function fromB64u(s: string): Uint8Array {
  const t = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

/** مقارنة بزمن ثابت */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}
export const sameText = (a: string, b: string) => sameBytes(enc.encode(a), enc.encode(b))

/* — كلمة المرور — */
/** حدّ Cloudflare Workers الأعلى لتكرارات PBKDF2 */
export const PBKDF2_ITER = 100_000

async function pbkdf2(password: string, salt: Uint8Array, iter: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: iter }, key, 256))
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return `pbkdf2$${PBKDF2_ITER}$${b64u(salt)}$${b64u(await pbkdf2(password, salt, PBKDF2_ITER))}`
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parts = (stored ?? '').split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iter = Number(parts[1])
  if (!Number.isInteger(iter) || iter < 10_000 || iter > PBKDF2_ITER) return false
  try {
    return sameBytes(await pbkdf2(password, fromB64u(parts[2]), iter), fromB64u(parts[3]))
  } catch {
    return false
  }
}

/** سبب رفض كلمة المرور، أو null */
export function passwordProblem(password: string, email = ''): string | null {
  const p = password ?? ''
  if (p.length < 10) return 'كلمة المرور 10 أحرف على الأقل'
  if (p.length > 200) return 'كلمة المرور طويلة جداً'
  if (/^(.)\1+$/.test(p)) return 'كلمة المرور حرف مكرر — اختر غيرها'
  const local = email.split('@')[0]?.toLowerCase() ?? ''
  if (email && (p.toLowerCase() === email.toLowerCase() || (local.length >= 4 && p.toLowerCase() === local))) return 'لا تجعل كلمة المرور بريدك'
  return null
}

/* — TOTP (Google Authenticator وAuthy وأمثالها) — */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

export function fromBase32(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/[\s=-]/g, '')
  let bits = 0, value = 0
  const out: number[] = []
  for (const ch of clean) {
    const i = B32.indexOf(ch)
    if (i < 0) throw new Error('base32')
    value = (value << 5) | i
    bits += 5
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8 }
  }
  return Uint8Array.from(out)
}

export const newTotpSecret = () => base32(crypto.getRandomValues(new Uint8Array(20)))
export const TOTP_PERIOD = 30
export const stepOf = (nowMs: number) => Math.floor(nowMs / 1000 / TOTP_PERIOD)

/** الرمز ذو الأرقام الستة لخطوة زمنية */
export async function totpAt(secret: string, step: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', fromBase32(secret) as BufferSource, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const msg = new Uint8Array(8)
  let x = step
  for (let i = 7; i >= 0; i--) { msg[i] = x & 255; x = Math.floor(x / 256) }
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg))
  const o = h[h.length - 1] & 15
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]
  return String(n % 1_000_000).padStart(6, '0')
}

/** يقبل الرمز في الخطوة الحالية أو المجاورة (فرق الساعة)، ولا يقبل خطوة سبق قبولها. يعيد الخطوة المقبولة أو null */
export async function verifyTotp(secret: string, code: string, nowMs: number, lastStep: number | null = null): Promise<number | null> {
  const c = (code ?? '').replace(/\s/g, '')
  if (!/^\d{6}$/.test(c)) return null
  const now = stepOf(nowMs)
  for (const s of [now, now - 1, now + 1]) {
    if (lastStep !== null && s <= lastStep) continue
    if (sameText(await totpAt(secret, s), c)) return s
  }
  return null
}

export function otpauthUri(secret: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`)
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${TOTP_PERIOD}`
}

/* — رموز موقّعة (الجلسة، خطوة التحقق الثنائي، روابط الدعوة وإعادة التعيين) — */
async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)))
}

/** payload يحمل exp (ثوانٍ) — والغرض (k) يفصل الجلسة عن الروابط فلا يصلح أحدها مكان الآخر */
export async function signToken(payload: Record<string, unknown> & { k: string; exp: number }, secret: string): Promise<string> {
  const body = b64u(enc.encode(JSON.stringify(payload)))
  return `${body}.${b64u(await hmac(secret, body))}`
}

export async function readToken<T extends { k: string; exp: number }>(token: string | undefined | null, secret: string, kind: string, nowMs = Date.now()): Promise<T | null> {
  const [body, mac] = (token ?? '').split('.')
  if (!body || !mac) return null
  try {
    if (!sameBytes(fromB64u(mac), await hmac(secret, body))) return null
    const v = JSON.parse(dec.decode(fromB64u(body))) as T
    if (v.k !== kind || typeof v.exp !== 'number' || v.exp <= nowMs / 1000) return null
    return v
  } catch {
    return null
  }
}

/** قفل بعد محاولات خاطئة: 5 محاولات ثم 15 دقيقة، وتتضاعف حتى ساعتين */
export function lockAfter(failures: number, nowMs: number): number | null {
  if (failures < 5) return null
  const minutes = Math.min(120, 15 * 2 ** Math.floor((failures - 5) / 5))
  return Math.floor(nowMs / 1000) + minutes * 60
}
