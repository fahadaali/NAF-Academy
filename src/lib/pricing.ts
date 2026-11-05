import type { Pricing } from '@/content/types'

export type PriceView = {
  free: boolean
  /** السعر الذي يُدفع الآن بالهللة */
  current: number
  /** السعر الأصلي إن كان هناك عرض ساري */
  original?: number
  /** نسبة التوفير مقرّبة لأقرب عدد صحيح */
  savePct?: number
  /** نهاية العرض إن كان محدداً بوقت وما زال سارياً */
  endsAt?: Date
}

/** يحسب ما يُعرض من السعر في لحظة معيّنة — العرض المنتهي يعود تلقائياً للسعر الأصلي */
export function priceView(p: Pricing, now: Date = new Date()): PriceView {
  if (p.free || p.amount <= 0) return { free: true, current: 0 }
  const end = p.saleEndsAt ? new Date(p.saleEndsAt) : undefined
  const saleLive = p.compareAt !== undefined && p.compareAt > p.amount && (!end || end.getTime() > now.getTime())
  if (!saleLive) return { free: false, current: p.compareAt && end ? p.compareAt : p.amount }
  return {
    free: false,
    current: p.amount,
    original: p.compareAt,
    savePct: Math.round((1 - p.amount / p.compareAt!) * 100),
    endsAt: end,
  }
}

/** هللات ← نص مبلغ بأرقام لاتينية، بلا كسور إن كان صحيحاً */
export function formatAmount(halalas: number): string {
  const sar = halalas / 100
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: Number.isInteger(sar) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(sar)
}
