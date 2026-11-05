/* محرّك التسعير — دالة نقية. الخادم يستدعيها عند كل إنشاء طلب وإتمامه، والمتصفح للعرض فقط.
   الترتيب: سعر الوحدة (مع العرض الساري) × العدد ← خصم المجموعة ← خصم الكوبون ← المجموع (شامل الضريبة). */
import { priceView } from './pricing'

export type QuoteCoupon = {
  code: string
  kind: 'percent' | 'amount'
  value: number
  scope: 'all' | 'courses' | 'tracks'
  courseIds: string[]
  trackIds: string[]
  startsAt: string | null
  endsAt: string | null
  maxUses: number | null
  maxPerLearner: number | null
  minAmount: number | null
  emailDomain: string
  stackWithSale: boolean
  active: boolean
  deletedAt?: string | null
}

export type QuoteInput = {
  price: { amount: number; compareAt?: number | null; saleEndsAt?: string | null; free?: boolean }
  quantity: number
  groupRules?: { minQty: number; percent: number }[]
  coupon?: QuoteCoupon | null
  uses?: { total: number; byLearner: number }
  email?: string
  courseId: string
  trackId?: string | null
  vatRate?: number
  now?: Date
}

export type Quote = {
  unitList: number
  unit: number
  saleActive: boolean
  quantity: number
  subtotal: number
  groupPercent: number
  groupDiscount: number
  couponDiscount: number
  couponError?: string
  couponApplied: boolean
  total: number
  vat: number
  free: boolean
}

export const MAX_QTY = 50

export function couponError(c: QuoteCoupon, ctx: { now: Date; courseId: string; trackId?: string | null; email?: string; saleActive: boolean; amount: number; uses?: { total: number; byLearner: number } }): string | undefined {
  if (!c.active || c.deletedAt) return 'هذا الكوبون غير متاح'
  if (c.startsAt && Date.parse(c.startsAt) > ctx.now.getTime()) return 'هذا الكوبون لم يبدأ بعد'
  if (c.endsAt && Date.parse(c.endsAt) < ctx.now.getTime()) return 'انتهت صلاحية هذا الكوبون'
  if (c.maxUses !== null && (ctx.uses?.total ?? 0) >= c.maxUses) return 'استُنفد هذا الكوبون'
  if (c.maxPerLearner !== null && ctx.email && (ctx.uses?.byLearner ?? 0) >= c.maxPerLearner) return 'استخدمت هذا الكوبون من قبل'
  if (c.scope === 'courses' && !c.courseIds.includes(ctx.courseId)) return 'هذا الكوبون لا ينطبق على هذه الدورة'
  if (c.scope === 'tracks' && (!ctx.trackId || !c.trackIds.includes(ctx.trackId))) return 'هذا الكوبون لا ينطبق على هذا المسار'
  if (c.emailDomain) {
    const d = c.emailDomain.replace(/^@/, '').toLowerCase()
    if (!ctx.email) return `أدخل بريدك في ${d} لتطبيق الكوبون`
    if (!ctx.email.toLowerCase().endsWith('@' + d)) return `هذا الكوبون مخصّص لبريد ${d}`
  }
  if (!c.stackWithSale && ctx.saleActive) return 'هذا الكوبون لا يجتمع مع العرض الحالي'
  if (c.minAmount !== null && ctx.amount < c.minAmount) return `الحد الأدنى لهذا الكوبون ${(c.minAmount / 100).toLocaleString('en-US')} ريال`
  return undefined
}

export function quote(i: QuoteInput): Quote {
  const now = i.now ?? new Date()
  const qty = Math.max(1, Math.min(MAX_QTY, Math.floor(i.quantity || 1)))
  const pv = priceView({ amount: i.price.amount, compareAt: i.price.compareAt ?? undefined, saleEndsAt: i.price.saleEndsAt ?? undefined, free: i.price.free }, now)
  const unit = pv.free ? 0 : pv.current
  const unitList = pv.original ?? unit
  const subtotal = unit * qty

  const rule = (i.groupRules ?? []).filter((r) => qty >= r.minQty).sort((a, b) => b.percent - a.percent)[0]
  const groupPercent = rule ? Math.max(0, Math.min(90, rule.percent)) : 0
  const groupDiscount = Math.round((subtotal * groupPercent) / 100)
  const afterGroup = subtotal - groupDiscount

  let couponDiscount = 0
  let err: string | undefined
  if (i.coupon && afterGroup > 0) {
    err = couponError(i.coupon, { now, courseId: i.courseId, trackId: i.trackId, email: i.email, saleActive: !!pv.original, amount: afterGroup, uses: i.uses })
    if (!err) couponDiscount = i.coupon.kind === 'percent'
      ? Math.round((afterGroup * Math.max(0, Math.min(100, i.coupon.value))) / 100)
      : Math.min(i.coupon.value, afterGroup)
  }
  const total = Math.max(0, afterGroup - couponDiscount)
  const rate = i.vatRate ?? 15
  const vat = Math.round((total * rate) / (100 + rate))
  return {
    unitList, unit, saleActive: !!pv.original, quantity: qty, subtotal, groupPercent, groupDiscount,
    couponDiscount, couponError: err, couponApplied: !!i.coupon && !err && couponDiscount > 0, total, vat, free: total === 0,
  }
}

export const normalizeCode = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40)
