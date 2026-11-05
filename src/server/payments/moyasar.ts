import 'server-only'
/* ميسر — https://docs.moyasar.com — المبالغ بالهللة، والمصادقة Basic بالمفتاح السري. */
import type { Gateway, GatewayPayment } from './gateway'

const API = 'https://api.moyasar.com/v1'

function auth() {
  return 'Basic ' + Buffer.from(`${process.env.MOYASAR_SECRET_KEY}:`).toString('base64')
}

type MoyasarPayment = {
  id: string
  status: string
  amount: number
  currency: string
  metadata?: Record<string, string> | null
  source?: { type?: string; company?: string; message?: string } | null
}

export function toGatewayPayment(p: MoyasarPayment): GatewayPayment {
  const method = p.source?.type === 'creditcard' ? (p.source.company ?? 'card') : (p.source?.type ?? '')
  return { id: p.id, status: p.status, amount: p.amount, currency: p.currency, orderId: p.metadata?.order_id ?? null, method, message: p.source?.message ?? '' }
}

export function moyasarGateway(f: typeof fetch = fetch): Gateway {
  const sk = process.env.MOYASAR_SECRET_KEY ?? ''
  return {
    kind: 'moyasar',
    mode: sk.startsWith('sk_live_') ? 'live' : 'test',
    publishableKey: process.env.MOYASAR_PUBLISHABLE_KEY ?? '',
    async fetchPayment(id) {
      if (!/^[\w-]{6,64}$/.test(id)) throw new Error('bad payment id')
      const r = await f(`${API}/payments/${encodeURIComponent(id)}`, { headers: { authorization: auth() }, cache: 'no-store' })
      if (!r.ok) throw new Error(`moyasar ${r.status}`)
      return toGatewayPayment((await r.json()) as MoyasarPayment)
    },
    async refund(paymentId, amount) {
      const r = await f(`${API}/payments/${encodeURIComponent(paymentId)}/refund`, {
        method: 'POST', headers: { authorization: auth(), 'content-type': 'application/json' }, body: JSON.stringify({ amount }),
      })
      if (!r.ok) throw new Error(`moyasar refund ${r.status}: ${await r.text().catch(() => '')}`)
      const p = (await r.json()) as MoyasarPayment
      return { id: p.id, status: p.status }
    },
  }
}
