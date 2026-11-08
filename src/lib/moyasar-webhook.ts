/* قراءة إشعار ميسر — دوال نقية مختبرة. توثيق ميسر لا يحدّد شكل طلب التحقق من الرابط، فنقبل الرمز أينما وُضع:
   أي حقل اسمه فيه code/verification بقيمة 4–8 أرقام، في أي عمق معقول. */

export type MoyasarBody = Record<string, unknown>

/** نوع الحدث من type أو event */
export const eventOf = (b: MoyasarBody): string => String(b.type ?? b.event ?? b.event_type ?? '').trim()

/** طلب تحقق من الرابط (لا حدث دفع «payment_verified») */
export const isVerification = (b: MoyasarBody) => {
  const t = eventOf(b).toLowerCase()
  return (t.includes('verification') || t === 'webhook_verify' || t === 'verify') && !t.startsWith('payment')
}

/** أول رمز تحقق (4–8 أرقام) في حقل اسمه يدل عليه، بعمق 4 على الأكثر */
export function findVerificationCode(v: unknown, depth = 0): string | null {
  if (!v || typeof v !== 'object' || depth > 4) return null
  const entries = Object.entries(v as Record<string, unknown>)
  for (const [k, x] of entries) {
    if (/code|verif/i.test(k) && (typeof x === 'string' || typeof x === 'number')) {
      const s = String(x).replace(/\s/g, '')
      if (/^\d{4,8}$/.test(s)) return s
    }
  }
  for (const [, x] of entries) {
    const r = findVerificationCode(x, depth + 1)
    if (r) return r
  }
  return null
}

/** جسم الطلب: JSON، أو نموذج مرمّز — وإلا null */
export function parseBody(text: string, contentType: string): MoyasarBody | null {
  if (/application\/x-www-form-urlencoded/i.test(contentType)) {
    const o: MoyasarBody = {}
    for (const [k, v] of new URLSearchParams(text)) o[k] = v
    return o
  }
  try {
    const j = JSON.parse(text)
    return j && typeof j === 'object' && !Array.isArray(j) ? (j as MoyasarBody) : null
  } catch {
    return null
  }
}

/** أحداث الدفع التي تستدعي التحقق من الدفعة لدى ميسر (ومنها «payment_faild» كما تكتبها ميسر) */
export const PAYMENT_EVENTS = new Set(['payment_paid', 'payment_failed', 'payment_faild', 'payment_captured', 'payment_authorized', 'payment_refunded', 'payment_voided'])

/* ───── ما يصل بلا السرّ لا يُوثق به ─────
   طلب التحقق من الرابط قد يصل بلا السرّ فيُقبل رمزه — لكنه لا يحلّ محل رمز موقّع حديث، والسجل يُبقي الموقّع
   فلا يُغرقه سيل طلبات مجهولة (والمسار يحدّ عددها لكل عنوان). */

export type VerifyCode = { code: string; at: string; signed: boolean }
export type WebhookLogHit = { at: string; signed: boolean }

/** صلاحية رمز التحقق في لوحة ميسر */
export const VERIFY_TTL_MS = 30 * 60e3
/** أقصى ما يبقى في السجل من الطلبات غير الموقّعة */
export const UNSIGNED_LOG_MAX = 3

/** هل يُحفظ الرمز الجديد؟ غير الموقّع لا يستبدل رمزاً موقّعاً ما زال صالحاً */
export function acceptVerify(prev: VerifyCode | null | undefined, next: VerifyCode, now = Date.now()): boolean {
  if (next.signed || !prev?.signed) return true
  return now - Date.parse(prev.at) >= VERIFY_TTL_MS
}

/** السجل الأحدث أولاً بحدّ max، وغير الموقّع منه لا يتجاوز UNSIGNED_LOG_MAX — فيبقى أثر الإشعارات الحقيقية */
export function mergeLog<T extends WebhookLogHit>(prev: unknown, hit: T, max: number): T[] {
  const list = [hit, ...(Array.isArray(prev) ? (prev as T[]) : [])]
  const out: T[] = []
  let unsigned = 0
  for (const h of list) {
    if (out.length >= max) break
    if (!h.signed && ++unsigned > UNSIGNED_LOG_MAX) continue
    out.push(h)
  }
  return out
}
