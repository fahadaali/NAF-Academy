/* Webhook ميسر — يضمن الإتمام حتى لو أغلق المشتري المتصفح قبل العودة.
   نتحقق من السرّ بزمن ثابت، ثم نجلب الدفعة من ميسر ولا نعتمد على جسم الطلب.
   وتحقّق ميسر من الرابط (webhook_verification): يُحفظ رمزه ويظهر للمالك في «إعدادات الدفع» ليدخله في لوحة ميسر —
   يُقبل ولو قبل إضافة السرّ (لا يغيّر شيئاً سوى عرض الرمز، والرمز الخاطئ ترفضه ميسر نفسها). */
import { envVar } from '@/server/runtime'
import { timingSafeEqual } from 'node:crypto'
import { confirmPayment } from '@/server/sales'
import { audit } from '@/server/audit'
import { setSetting } from '@/server/settings'

/** مفتاح الإعداد مكرَّر في صفحة إعدادات الدفع — ملف المسار لا يصدّر غير معالجاته */
const VERIFY_KEY = 'moyasar_webhook_verify'

export const dynamic = 'force-dynamic'

function sameSecret(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export async function POST(req: Request) {
  const secret = envVar('MOYASAR_WEBHOOK_SECRET') ?? ''
  let body: { type?: string; secret_token?: string; data?: { id?: string; verification_code?: string | number; metadata?: { order_id?: string } } }
  try {
    body = await req.json()
  } catch {
    return new Response('bad json', { status: 400 })
  }
  if (body.type === 'webhook_verification') {
    const code = String(body.data?.verification_code ?? '').trim()
    if (!/^\d{4,8}$/.test(code)) return new Response('bad code', { status: 400 })
    const signed = !!secret && !!body.secret_token && sameSecret(body.secret_token, secret)
    await setSetting(VERIFY_KEY, { code, at: new Date().toISOString(), signed })
    await audit('webhook', 'verify', 'payments', 'moyasar', signed ? 'رمز تحقق ميسر — بالسرّ الصحيح' : 'رمز تحقق ميسر')
    return new Response('ok')
  }
  if (!secret || !body.secret_token || !sameSecret(body.secret_token, secret)) return new Response('forbidden', { status: 403 })
  const id = body.data?.id
  if (!id) return new Response('ok')
  if (body.type === 'payment_paid' || body.type === 'payment_failed' || body.type === 'payment_captured') {
    try {
      await confirmPayment(id, body.data?.metadata?.order_id)
    } catch (e) {
      await audit('webhook', 'error', 'payment', id, String((e as Error).message).slice(0, 200))
      return new Response('retry', { status: 500 })
    }
  }
  return new Response('ok')
}
