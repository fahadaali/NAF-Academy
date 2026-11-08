/* Webhook ميسر — يؤكد الدفع من جهة الخادم (لا يعتمد على عودة المتصفح). السرّ: secret_token في الجسم.
   وتحقّق ميسر من الرابط (webhook_verification): يُحفظ رمزه ويظهر للمالك في «إعدادات الدفع» ليدخله في لوحة ميسر.
   شكل طلب التحقق غير موثّق، فالرمز يُقرأ أينما وُضع (src/lib/moyasar-webhook.ts).
   وكل ما يصل يُسجَّل مختصراً (الوقت ونوع الحدث وأسماء الحقول والنتيجة — بلا بيانات دفع ولا السرّ) لتشخيص الربط من اللوحة.
   ما يصل بلا السرّ محدود العدد لكل عنوان، ورمزه لا يحلّ محل رمز موقّع صالح، ولا يُغرق السجل (src/lib/moyasar-webhook.ts). */
import { envVar } from '@/server/runtime'
import { timingSafeEqual } from 'node:crypto'
import { confirmPayment } from '@/server/sales'
import { audit } from '@/server/audit'
import { getSetting, setSetting } from '@/server/settings'
import { limited } from '@/server/ratelimit'
import { acceptVerify, eventOf, findVerificationCode, isVerification, mergeLog, parseBody, PAYMENT_EVENTS, type MoyasarBody, type VerifyCode } from '@/lib/moyasar-webhook'

/** مفاتيح الإعداد مكرَّرة في صفحة إعدادات الدفع — ملف المسار لا يصدّر غير معالجاته */
const VERIFY_KEY = 'moyasar_webhook_verify'
const LOG_KEY = 'moyasar_webhook_log'
const LOG_MAX = 8
/** طلبات بلا السرّ لكل عنوان في النافذة — ميسر يرسل طلب تحقق واحداً عند الربط */
const UNSIGNED_MAX = 10
const UNSIGNED_WINDOW = 10 * 60e3

export const dynamic = 'force-dynamic'

type Hit = { at: string; type: string; keys: string[]; code: string | null; signed: boolean; result: string }

function sameSecret(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** رمز التحقق: غير الموقّع لا يستبدل رمزاً موقّعاً صالحاً. يعيد هل حُفظ */
async function saveVerify(v: VerifyCode) {
  const prev = await getSetting<VerifyCode | null>(VERIFY_KEY, null)
  if (!acceptVerify(prev, v)) return false
  await setSetting(VERIFY_KEY, v)
  return true
}

async function log(hit: Hit) {
  try {
    const prev = await getSetting<Hit[]>(LOG_KEY, [])
    await setSetting(LOG_KEY, mergeLog(prev, hit, LOG_MAX))
  } catch { /* السجل للتشخيص فقط — لا يعطّل الإشعار */ }
}

export async function POST(req: Request) {
  const secret = envVar('MOYASAR_WEBHOOK_SECRET') ?? ''
  const at = new Date().toISOString()
  const text = await req.text().catch(() => '')
  const body: MoyasarBody | null = parseBody(text, req.headers.get('content-type') ?? '')
  const type = body ? eventOf(body) : ''
  const keys = body ? Object.keys(body).filter((k) => k !== 'secret_token').slice(0, 12) : []
  const token = body && typeof body.secret_token === 'string' ? body.secret_token : ''
  const signed = !!secret && !!token && sameSecret(token, secret)
  /* بلا السرّ: حدّ لكل عنوان قبل أي كتابة — لا إعداد ولا سجل */
  if (!signed && (await limited('moyasar-webhook', UNSIGNED_MAX, UNSIGNED_WINDOW))) return new Response('too many', { status: 429 })

  if (!body) {
    await log({ at, type: '', keys: [], code: null, signed: false, result: 'جسم غير مقروء' })
    return new Response('bad body', { status: 400 })
  }

  /* التحقق من الرابط: النوع صريح، أو حدث غير دفعي يحمل رمزاً */
  const code = findVerificationCode(body)
  if (isVerification(body) || (code && !PAYMENT_EVENTS.has(type))) {
    if (!code) {
      await log({ at, type, keys, code: null, signed, result: 'طلب تحقق بلا رمز مقروء' })
      return new Response('bad code', { status: 400 })
    }
    const kept = await saveVerify({ code, at, signed })
    await log({ at, type, keys, code, signed, result: kept ? (signed ? 'رمز تحقق' : 'رمز تحقق غير موقّع') : 'رمز غير موقّع — أُبقي الرمز الموقّع' })
    if (kept) await audit('webhook', 'verify', 'payments', 'moyasar', signed ? 'رمز تحقق ميسر — بالسرّ الصحيح' : 'رمز تحقق ميسر — بلا السرّ (غير موثّق)')
    return new Response('ok')
  }

  if (!signed) {
    await log({ at, type, keys, code: null, signed, result: secret ? 'رُفض: السرّ غير مطابق' : 'رُفض: MOYASAR_WEBHOOK_SECRET غير مضبوط' })
    return new Response('forbidden', { status: 403 })
  }
  const data = (body.data ?? {}) as { id?: string; metadata?: { order_id?: string } }
  const id = typeof data.id === 'string' ? data.id : ''
  if (!id || !PAYMENT_EVENTS.has(type)) {
    await log({ at, type, keys, code: null, signed, result: 'تجاهل: حدث غير دفعي' })
    return new Response('ok')
  }
  try {
    await confirmPayment(id, data.metadata?.order_id)
    await log({ at, type, keys, code: null, signed, result: 'تحقّق من الدفعة' })
  } catch (e) {
    await audit('webhook', 'error', 'payment', id, String((e as Error).message).slice(0, 200))
    await log({ at, type, keys, code: null, signed, result: 'خطأ — ستعيد ميسر المحاولة' })
    return new Response('retry', { status: 500 })
  }
  return new Response('ok')
}

/** بعض المنصات تختبر الرابط بطلب GET — يُسجَّل، ويُقرأ الرمز من الاستعلام إن وُجد */
export async function GET(req: Request) {
  if (await limited('moyasar-webhook', UNSIGNED_MAX, UNSIGNED_WINDOW)) return new Response('too many', { status: 429 })
  const at = new Date().toISOString()
  const q: MoyasarBody = Object.fromEntries(new URL(req.url).searchParams)
  const code = findVerificationCode(q)
  const kept = code ? await saveVerify({ code, at, signed: false }) : false
  await log({ at, type: 'GET', keys: Object.keys(q).slice(0, 12), code, signed: false, result: code ? (kept ? 'رمز تحقق غير موقّع' : 'رمز غير موقّع — أُبقي الرمز الموقّع') : 'فحص الرابط' })
  return new Response('ok')
}
