import 'server-only'
/* واجهة البوابة — ميسر في الإنتاج، وبوابة تجريبية محلية للاختبار فقط. */

export type GatewayPayment = {
  id: string
  status: 'paid' | 'failed' | 'initiated' | 'authorized' | 'captured' | 'refunded' | 'voided' | string
  amount: number
  currency: string
  orderId: string | null
  method: string
  message: string
}

export interface Gateway {
  kind: 'moyasar' | 'mock'
  mode: 'test' | 'live' | 'mock'
  publishableKey: string
  fetchPayment(id: string): Promise<GatewayPayment>
  refund(paymentId: string, amount: number): Promise<{ id: string; status: string }>
}

export type GatewayStatus = { configured: boolean; kind: Gateway['kind'] | null; mode: Gateway['mode'] | null; problem?: string }

/** البوابة التجريبية لا تعمل إلا بموافقة صريحة، وتظهر بتحذير في اللوحة */
const mockAllowed = () => process.env.PAYMENTS_GATEWAY === 'mock' && process.env.NODE_ENV !== 'production'

export function gatewayStatus(): GatewayStatus {
  if (mockAllowed()) return { configured: true, kind: 'mock', mode: 'mock' }
  const sk = process.env.MOYASAR_SECRET_KEY ?? ''
  const pk = process.env.MOYASAR_PUBLISHABLE_KEY ?? ''
  const wh = process.env.MOYASAR_WEBHOOK_SECRET ?? ''
  if (!sk || !pk) return { configured: false, kind: null, mode: null, problem: 'مفاتيح ميسر غير مضافة في البيئة' }
  if (!wh) return { configured: false, kind: 'moyasar', mode: null, problem: 'سرّ الـWebhook غير مضاف (MOYASAR_WEBHOOK_SECRET)' }
  const live = sk.startsWith('sk_live_')
  if (live !== pk.startsWith('pk_live_')) return { configured: false, kind: 'moyasar', mode: null, problem: 'المفتاحان من بيئتين مختلفتين (اختبار/إنتاج)' }
  return { configured: true, kind: 'moyasar', mode: live ? 'live' : 'test' }
}

export async function gateway(): Promise<Gateway | null> {
  const st = gatewayStatus()
  if (!st.configured) return null
  if (st.kind === 'mock') return (await import('./mock')).mockGateway
  return (await import('./moyasar')).moyasarGateway()
}
