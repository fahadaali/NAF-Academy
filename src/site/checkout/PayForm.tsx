'use client'
/* نموذج ميسر المضمّن — بيانات البطاقة تذهب لميسر مباشرة ولا تمرّ بخادمنا.
   وفي البوابة التجريبية: أزرار محاكاة نجاح/رفض للاختبار. */
import { useEffect, useRef, useState } from 'react'

const MPF = 'https://cdn.moyasar.com/mpf/1.14.0'

type Props = {
  kind: 'moyasar' | 'mock'
  publishableKey: string
  orderId: string
  orderNumber: string
  amount: number
  description: string
  callbackUrl: string
  methods: string[]
  merchant: string
}

declare global {
  interface Window { Moyasar?: { init: (o: Record<string, unknown>) => void } }
}

export function PayForm(p: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(p.kind === 'mock')
  const [error, setError] = useState('')

  useEffect(() => {
    if (p.kind !== 'moyasar') return
    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = `${MPF}/moyasar.css`
    document.head.appendChild(css)
    const js = document.createElement('script')
    js.src = `${MPF}/moyasar.js`
    js.onload = () => {
      if (!window.Moyasar || !box.current) return setError('تعذّر تحميل نموذج الدفع')
      window.Moyasar.init({
        element: box.current,
        amount: p.amount,
        currency: 'SAR',
        description: p.description,
        publishable_api_key: p.publishableKey,
        callback_url: p.callbackUrl,
        methods: p.methods,
        language: 'ar',
        metadata: { order_id: p.orderId, order_number: p.orderNumber },
        apple_pay: { country: 'SA', label: p.merchant, validate_merchant_url: 'https://api.moyasar.com/v1/applepay/initiate' },
      })
      setReady(true)
    }
    js.onerror = () => setError('تعذّر الاتصال ببوابة الدفع — حدّث الصفحة')
    document.body.appendChild(js)
    return () => { css.remove(); js.remove() }
  }, [p])

  if (p.kind === 'mock') {
    const go = (r: 'paid' | 'failed') => {
      const u = new URL(p.callbackUrl, location.origin)
      u.searchParams.set('id', `mock_${p.orderId}_${p.amount}_${r}`)
      u.searchParams.set('status', r)
      location.href = u.toString()
    }
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <p style={{ padding: 12, borderRadius: 12, background: 'var(--surface-2)', fontSize: 14, fontWeight: 600 }}>⚠︎ بوابة تجريبية محلية — لا يُخصم أي مبلغ.</p>
        <button className="btn" onClick={() => go('paid')}>محاكاة دفع ناجح بمدى</button>
        <button className="btn ghost" onClick={() => go('failed')}>محاكاة رفض البطاقة</button>
      </div>
    )
  }
  return (
    <div>
      {!ready && !error && <p style={{ color: 'var(--muted)' }}>يُحمَّل نموذج الدفع الآمن…</p>}
      {error && <p style={{ color: 'var(--danger)', fontWeight: 600 }}>{error}</p>}
      <div ref={box} className="mysr-form" />
    </div>
  )
}
