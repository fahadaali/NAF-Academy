import type { Pricing, Promo } from '@/content/types'

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
  /** اسم العرض العام إن كان هو الأفضل (مثل «عرض اليوم الوطني») */
  label?: string
}

const within = (t: number, start?: string | null, end?: string | null) =>
  (!start || Date.parse(start) <= t) && (!end || Date.parse(end) > t)

/** سعر العرض العام على السعر الأصلي. النسبة مقيّدة بـ 90%، والمبلغ الثابت قد يبلغ الصفر (لا سالب) — فيصير الطلب مجانياً
    بلا فاتورة، ومقعداً واحداً للزائر كأي طلب بإجمالي صفر (placeOrder). لا حدّ أدنى مصطنع (ريال مثلاً) لأنه يُصدر فاتورة
    بمبلغ لم يقصده أحد؛ ومن أراد خصماً لا يجعلها مجانية يضبط المبلغ دون السعر. */
export const promoPrice = (base: number, p: Pick<Promo, 'kind' | 'value'>) =>
  Math.max(0, p.kind === 'percent' ? Math.round(base * (1 - Math.max(0, Math.min(90, p.value)) / 100)) : base - p.value)

/** يحسب ما يُعرض من السعر في لحظة معيّنة: عرض الدورة في نافذته (من البداية إلى النهاية) أو أفضل عرض عام منطبق —
    الأفضل للمشتري بلا تراكم — وخارج النوافذ يعود السعر الأصلي تلقائياً */
export function priceView(p: Pricing, now: Date = new Date()): PriceView {
  if (p.free || p.amount <= 0) return { free: true, current: 0 }
  const t = now.getTime()
  const hasSale = p.compareAt !== undefined && p.compareAt > p.amount
  const base = hasSale ? p.compareAt! : p.amount
  const saleLive = hasSale && within(t, p.saleStartsAt, p.saleEndsAt)
  let best: { price: number; endsAt?: string | null; label?: string } = saleLive ? { price: p.amount, endsAt: p.saleEndsAt } : { price: base }
  for (const pr of p.promos ?? []) {
    if (!within(t, pr.startsAt, pr.endsAt)) continue
    const price = promoPrice(base, pr)
    if (price < best.price) best = { price, endsAt: pr.endsAt, label: pr.label }
  }
  if (best.price >= base) return { free: false, current: base }
  return {
    free: false,
    current: best.price,
    original: base,
    savePct: Math.round((1 - best.price / base) * 100),
    endsAt: best.endsAt ? new Date(best.endsAt) : undefined,
    label: best.label,
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
