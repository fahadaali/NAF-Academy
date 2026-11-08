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
