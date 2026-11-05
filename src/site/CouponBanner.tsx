'use client'
/* ‎?coupon=CODE في أي رابط يُحفظ للجلسة، ويظهر شريطاً بالسعر بعد الخصم، ويُمرَّر لصفحة التسجيل. */
import { useEffect, useState } from 'react'
import { quoteAction, type QuoteView } from './actions'
import { formatAmount } from '@/lib/pricing'
import { Riyal } from '@/components/Riyal'

const KEY = 'naf-academy-coupon'

/** في غلاف الموقع: ‎?coupon=CODE في أي صفحة (رابط الكوبون من اللوحة يفتح الكتالوج) يُحفظ للجلسة،
    فيُطبَّق في صفحة أي دورة يختارها الزائر بعد ذلك. صفحة الدورة نفسها يتولاها CouponBanner. */
export function CouponCatcher() {
  const [code, setCode] = useState('')
  useEffect(() => {
    const c = new URLSearchParams(location.search).get('coupon')?.trim()
    if (!c) return
    try { sessionStorage.setItem(KEY, c) } catch {}
    if (!/^\/courses\/[^/]+$/.test(location.pathname)) setCode(c)
  }, [])
  if (!code) return null
  return (
    <div role="status" style={{
      position: 'sticky', insetBlockStart: 'var(--header-h)', zIndex: 30, display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap',
      padding: '10px 16px', background: 'var(--gold-3)', color: 'var(--night-1)', fontWeight: 700, fontSize: 15,
    }}>
      <span>كوبون {code.toUpperCase()} محفوظ — يُطبَّق على سعر الدورة التي تختارها</span>
    </div>
  )
}

export function CouponBanner({ slug }: { slug: string }) {
  const [q, setQ] = useState<QuoteView | null>(null)
  const [code, setCode] = useState('')
  useEffect(() => {
    let c = new URLSearchParams(location.search).get('coupon') ?? ''
    try {
      if (c) sessionStorage.setItem(KEY, c)
      else c = sessionStorage.getItem(KEY) ?? ''
    } catch {}
    if (!c) return
    setCode(c)
    quoteAction(slug, { quantity: 1, code: c }).then((r) => {
      if (!r?.couponApplied) return
      setQ(r)
      document.querySelectorAll<HTMLAnchorElement>(`a[href^="/courses/${slug}/enroll"]`).forEach((a) => {
        const u = new URL(a.href)
        u.searchParams.set('coupon', c)
        a.href = u.pathname + u.search
      })
    })
  }, [slug])
  if (!q) return null
  return (
    <div role="status" style={{
      position: 'sticky', insetBlockStart: 'var(--header-h)', zIndex: 30, display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap',
      padding: '10px 16px', background: 'var(--gold-3)', color: 'var(--night-1)', fontWeight: 700, fontSize: 15, animation: 'none',
    }}>
      <span>كوبون {code.toUpperCase()} مفعّل</span>
      <span className="num">السعر بعد الخصم: {formatAmount(q.total)} <Riyal /> {q.saleActive || q.couponDiscount ? <s style={{ opacity: 0.6, fontWeight: 500 }}>{formatAmount(q.unitList)}</s> : null}</span>
    </div>
  )
}
