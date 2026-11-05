import 'server-only'
/* منطق البيع على الخادم — التسعير الموثوق، والمقاعد، وإنشاء الطلب، والإتمام الذري، والاسترداد. */
import { randomBytes, randomUUID } from 'node:crypto'
import { and, asc, count, eq, gt, inArray, isNull, sql, sum } from 'drizzle-orm'
import { db, schema as s } from './db'
import { audit } from './audit'
import { paymentSettings } from './settings'
import { zatcaTlv } from './payments/zatca'
import { gateway } from './payments/gateway'
import { normalizeCode, quote, type Quote } from '@/lib/quote'
import { resolveStatus } from '@/lib/course-meta'
import type { CourseRow, CouponRow, OrderRow, TierRow } from './db/schema'

const nowIso = () => new Date().toISOString()
export const secretToken = () => randomBytes(18).toString('base64url')

/* ───────── الترقيم الذرّي ───────── */
export async function nextNumber(key: string, prefix: string) {
  const [r] = await db.insert(s.counters).values({ key, value: 1 })
    .onConflictDoUpdate({ target: s.counters.key, set: { value: sql`${s.counters.value} + 1` } })
    .returning({ value: s.counters.value })
  return `${prefix}-${new Date().getFullYear()}-${String(r.value).padStart(6, '0')}`
}

/* ───────── المقاعد ───────── */
/** المشغول = المحجوز يدوياً + التسجيلات النشطة + مقاعد المؤسسات غير المخصّصة + الطلبات المعلّقة السارية */
export async function seatsUsed(course: Pick<CourseRow, 'id' | 'seatsTaken'>, tierId?: string | null) {
  const now = nowIso()
  const [e] = await db.select({ n: count() }).from(s.enrollments)
    .where(and(eq(s.enrollments.courseId, course.id), eq(s.enrollments.status, 'active'), tierId ? eq(s.enrollments.tierId, tierId) : undefined))
  const [g] = await db.select({ n: count() }).from(s.seatGrants)
    .innerJoin(s.orders, eq(s.orders.id, s.seatGrants.orderId))
    .innerJoin(s.orderItems, and(eq(s.orderItems.orderId, s.orders.id), eq(s.orderItems.courseId, s.seatGrants.courseId)))
    .where(and(eq(s.seatGrants.courseId, course.id), isNull(s.seatGrants.enrollmentId), inArray(s.orders.status, ['paid', 'partially_refunded']), tierId ? eq(s.orderItems.tierId, tierId) : undefined))
  const [p] = await db.select({ n: sum(s.orderItems.quantity) }).from(s.orderItems)
    .innerJoin(s.orders, eq(s.orders.id, s.orderItems.orderId))
    .where(and(eq(s.orderItems.courseId, course.id), eq(s.orders.status, 'pending'), gt(s.orders.expiresAt, now), tierId ? eq(s.orderItems.tierId, tierId) : undefined))
  return (tierId ? 0 : course.seatsTaken) + e.n + g.n + Number(p.n ?? 0)
}

/* ───────── الكوبون ───────── */
export async function findCoupon(code: string) {
  const c = normalizeCode(code)
  if (!c) return null
  const [row] = await db.select().from(s.coupons).where(and(eq(s.coupons.code, c), isNull(s.coupons.deletedAt)))
  return row ?? null
}

async function couponUses(couponId: string, email?: string) {
  const [t] = await db.select({ n: count() }).from(s.couponRedemptions).where(eq(s.couponRedemptions.couponId, couponId))
  let mine = 0
  if (email) {
    const [m] = await db.select({ n: count() }).from(s.couponRedemptions)
      .innerJoin(s.learners, eq(s.learners.id, s.couponRedemptions.learnerId))
      .where(and(eq(s.couponRedemptions.couponId, couponId), eq(s.learners.email, email.toLowerCase())))
    mine = m.n
  }
  return { total: t.n, byLearner: mine }
}

/* ───────── التسعير الموثوق ───────── */
export type PricedCourse = { course: CourseRow; tier: TierRow | null; tiers: TierRow[]; coupon: CouponRow | null; q: Quote }

export async function priceFor(slug: string, opts: { tierId?: string | null; quantity: number; code?: string; email?: string }): Promise<PricedCourse | null> {
  const [course] = await db.select().from(s.courses).where(and(eq(s.courses.slug, slug), isNull(s.courses.deletedAt)))
  if (!course) return null
  const tiers = await db.select().from(s.priceTiers).where(eq(s.priceTiers.courseId, course.id)).orderBy(asc(s.priceTiers.sortOrder))
  const tier = tiers.length ? tiers.find((t) => t.id === opts.tierId) ?? tiers.find((t) => t.highlight) ?? tiers[0] : null
  const rules = await db.select().from(s.groupRules).where(eq(s.groupRules.courseId, course.id))
  const coupon = opts.code ? await findCoupon(opts.code) : null
  const settings = await paymentSettings()
  const q = quote({
    price: tier ? { amount: tier.price, compareAt: tier.compareAt, saleEndsAt: course.saleEndsAt } : { amount: course.price, compareAt: course.compareAt, saleEndsAt: course.saleEndsAt, free: course.free },
    quantity: opts.quantity, groupRules: rules, coupon, uses: coupon ? await couponUses(coupon.id, opts.email) : undefined,
    email: opts.email, courseId: course.id, trackId: course.trackId, vatRate: settings.vatRate,
  })
  if (opts.code && !coupon) q.couponError = 'رمز الكوبون غير صحيح'
  return { course, tier, tiers, coupon, q }
}

/* ───────── المتدرب ───────── */
export async function upsertLearner(b: { name: string; email: string; phone: string; org: string; vatNumber: string }) {
  const email = b.email.trim().toLowerCase()
  const [row] = await db.insert(s.learners).values({ id: randomUUID(), ...b, email })
    .onConflictDoUpdate({ target: s.learners.email, set: { name: b.name, phone: b.phone || sql`${s.learners.phone}`, org: b.org || sql`${s.learners.org}`, vatNumber: b.vatNumber || sql`${s.learners.vatNumber}`, updatedAt: nowIso() } })
    .returning()
  return row
}

/* ───────── إنشاء الطلب ───────── */
export type Buyer = { name: string; email: string; phone: string; org: string; vatNumber: string }

export type PlaceResult =
  | { ok: true; order: OrderRow; free: boolean }
  | { ok: false; error: string }

export async function placeOrder(p: { slug: string; tierId?: string | null; quantity: number; code?: string; buyer: Buyer; attendSelf: boolean; method?: OrderRow['method']; by?: string; note?: string; skipPaymentsCheck?: boolean }): Promise<PlaceResult> {
  const priced = await priceFor(p.slug, { tierId: p.tierId, quantity: p.quantity, code: p.code, email: p.buyer.email })
  if (!priced) return { ok: false, error: 'الدورة غير موجودة' }
  const { course, tier, coupon, q } = priced
  const status = resolveStatus(course.status, course.publishAt)
  if (!p.by && status !== 'open') return { ok: false, error: 'التسجيل غير متاح في هذه الدورة الآن' }
  if (p.code && q.couponError) return { ok: false, error: q.couponError }

  const settings = await paymentSettings()
  const method = p.method ?? (q.free ? (q.couponApplied ? 'grant' : 'free') : 'gateway')
  if (method === 'gateway' && !p.skipPaymentsCheck) {
    const g = await gateway()
    if (!settings.enabled || !g) return { ok: false, error: 'الدفع الإلكتروني غير مفعّل بعد' }
  }

  /* السعة: للدورة كلها، وللباقة إن كانت لها سعة */
  if (course.seatsTotal !== null && (await seatsUsed(course)) + q.quantity > course.seatsTotal)
    return { ok: false, error: 'لم تعد المقاعد المتبقية تكفي هذا العدد' }
  if (tier?.capacity != null && (await seatsUsed(course, tier.id)) + q.quantity > tier.capacity)
    return { ok: false, error: `اكتملت مقاعد باقة «${tier.name}»` }

  const learner = await upsertLearner(p.buyer)
  const id = randomUUID()
  const order = {
    id, number: await nextNumber('order', settings.orderPrefix), token: secretToken(), learnerId: learner.id,
    status: 'pending' as const, method, buyer: { ...p.buyer, email: learner.email },
    subtotal: q.subtotal, groupDiscount: q.groupDiscount, couponDiscount: q.couponDiscount, total: q.total, vat: q.vat,
    couponId: q.couponApplied ? coupon!.id : null, couponCode: q.couponApplied ? coupon!.code : '',
    expiresAt: new Date(Date.now() + settings.holdMinutes * 60e3).toISOString(),
    attendSelf: q.quantity === 1 ? true : p.attendSelf, createdBy: p.by ?? 'web', note: p.note ?? '',
  }
  await db.insert(s.orders).values(order)
  await db.insert(s.orderItems).values({
    id: randomUUID(), orderId: id, courseId: course.id, tierId: tier?.id ?? null, title: course.title, tierName: tier?.name ?? '',
    unitPrice: q.unit, listPrice: q.unitList, quantity: q.quantity, lineTotal: q.subtotal,
  })
  await audit(p.by ?? learner.email, 'order', 'order', id, `${order.number} · ${course.title}`)
  const [row] = await db.select().from(s.orders).where(eq(s.orders.id, id))
  if (method !== 'gateway') {
    await finalizeOrder(id, { method })
    const [done] = await db.select().from(s.orders).where(eq(s.orders.id, id))
    return { ok: true, order: done, free: true }
  }
  return { ok: true, order: row, free: false }
}

/* ───────── الإتمام (ذري ومتكرّر الأمان) ───────── */
export async function finalizeOrder(orderId: string, info: { method: OrderRow['method']; paymentId?: string; by?: string }): Promise<'done' | 'already'> {
  const paidAt = nowIso()
  const claimed = await db.update(s.orders)
    .set({ status: 'paid', paidAt, method: info.method, gatewayPaymentId: info.paymentId ?? null, updatedAt: paidAt })
    .where(and(eq(s.orders.id, orderId), inArray(s.orders.status, ['pending', 'expired', 'failed'])))
    .returning()
  if (!claimed.length) return 'already'
  const order = claimed[0]
  const items = await db.select().from(s.orderItems).where(eq(s.orderItems.orderId, orderId))
  const source = info.method === 'gateway' ? 'purchase' : info.method === 'grant' ? 'grant' : info.method === 'free' ? 'free' : 'manual'

  for (const it of items) {
    if (it.quantity === 1) {
      await db.insert(s.enrollments).values({ id: randomUUID(), learnerId: order.learnerId, courseId: it.courseId, tierId: it.tierId, orderId, source })
    } else {
      const grants = Array.from({ length: it.quantity }, () => ({ id: randomUUID(), orderId, courseId: it.courseId, email: null as string | null, enrollmentId: null as string | null }))
      if (order.attendSelf) {
        const eid = randomUUID()
        await db.insert(s.enrollments).values({ id: eid, learnerId: order.learnerId, courseId: it.courseId, tierId: it.tierId, orderId, source: 'seat' })
        grants[0].email = order.buyer.email
        grants[0].enrollmentId = eid
      }
      await db.insert(s.seatGrants).values(grants)
    }
  }
  if (order.couponId) {
    await db.insert(s.couponRedemptions).values({ id: randomUUID(), couponId: order.couponId, orderId, learnerId: order.learnerId, amount: order.couponDiscount })
  }
  if (order.total > 0) await issueInvoice(order, items, 'invoice')
  await audit(info.by ?? 'system', 'paid', 'order', orderId, `${order.number} · ${(order.total / 100).toFixed(2)} ر.س · ${info.method}`)
  return 'done'
}

/* ───────── الفواتير ───────── */
async function issueInvoice(order: OrderRow, items: { title: string; tierName: string; quantity: number; unitPrice: number; lineTotal: number }[], kind: 'invoice' | 'credit_note', amount?: number, refOf?: string) {
  const settings = await paymentSettings()
  const issuedAt = nowIso()
  const total = kind === 'invoice' ? order.total : amount!
  const vat = Math.round((total * settings.vatRate) / (100 + settings.vatRate))
  const lines = kind === 'invoice'
    ? items.map((i) => ({ title: i.tierName ? `${i.title} — ${i.tierName}` : i.title, quantity: i.quantity, unit: i.unitPrice, total: i.lineTotal }))
    : [{ title: `استرداد — الطلب ${order.number}`, quantity: 1, unit: total, total }]
  if (kind === 'invoice' && order.groupDiscount) lines.push({ title: 'خصم المقاعد الجماعية', quantity: 1, unit: -order.groupDiscount, total: -order.groupDiscount })
  if (kind === 'invoice' && order.couponDiscount) lines.push({ title: `خصم الكوبون ${order.couponCode}`, quantity: 1, unit: -order.couponDiscount, total: -order.couponDiscount })
  const number = await nextNumber(kind === 'invoice' ? 'invoice' : 'credit', kind === 'invoice' ? settings.invoicePrefix : 'CN')
  await db.insert(s.invoices).values({
    id: randomUUID(), number, kind, orderId: order.id, refOf: refOf ?? null, seller: settings.seller,
    buyer: { name: order.buyer.name, email: order.buyer.email, org: order.buyer.org, vatNumber: order.buyer.vatNumber },
    lines, total, vat, issuedAt,
    qr: zatcaTlv({ seller: settings.seller.name, vatNumber: settings.seller.vatNumber || '-', timestamp: issuedAt.replace(/\.\d+Z$/, 'Z'), total: kind === 'invoice' ? total : -total, vat: kind === 'invoice' ? vat : -vat }),
  })
  return number
}

/* ───────── الدفع عبر البوابة ───────── */
/** يجلب الدفعة من البوابة نفسها (لا يثق بما يرسله المتصفح) ثم يُتمّ أو يسجّل الفشل */
export async function confirmPayment(paymentId: string, expectOrderId?: string): Promise<{ order: OrderRow | null; outcome: 'paid' | 'failed' | 'mismatch' | 'unknown' }> {
  const g = await gateway()
  if (!g) return { order: null, outcome: 'unknown' }
  const p = await g.fetchPayment(paymentId)
  const oid = p.orderId ?? expectOrderId
  if (!oid || (expectOrderId && p.orderId && p.orderId !== expectOrderId)) return { order: null, outcome: 'mismatch' }
  const [order] = await db.select().from(s.orders).where(eq(s.orders.id, oid))
  if (!order) return { order: null, outcome: 'mismatch' }
  if (p.amount !== order.total || p.currency.toUpperCase() !== 'SAR') {
    await audit('system', 'mismatch', 'order', order.id, `مبلغ الدفعة ${p.amount} لا يطابق ${order.total}`)
    return { order, outcome: 'mismatch' }
  }
  await db.insert(s.payments).values({ id: randomUUID(), orderId: order.id, gateway: g.kind, gatewayId: p.id, status: p.status, amount: p.amount, method: p.method, message: p.message })
    .onConflictDoUpdate({ target: s.payments.gatewayId, set: { status: p.status, message: p.message, updatedAt: nowIso() } })
  if (p.status === 'paid' || p.status === 'captured') {
    await finalizeOrder(order.id, { method: 'gateway', paymentId: p.id })
    const [fresh] = await db.select().from(s.orders).where(eq(s.orders.id, order.id))
    return { order: fresh, outcome: 'paid' }
  }
  if (p.status === 'failed') return { order, outcome: 'failed' }
  return { order, outcome: 'unknown' }
}

/* ───────── الاسترداد ───────── */
export async function refundOrder(orderId: string, amount: number, reason: string, cancelEnrollments: boolean, by: string): Promise<{ ok: boolean; error?: string }> {
  const [order] = await db.select().from(s.orders).where(eq(s.orders.id, orderId))
  if (!order || !['paid', 'partially_refunded'].includes(order.status)) return { ok: false, error: 'الطلب غير قابل للاسترداد' }
  const left = order.total - order.refunded
  if (!Number.isInteger(amount) || amount <= 0 || amount > left) return { ok: false, error: `المبلغ يجب أن يكون بين 0.01 و${(left / 100).toFixed(2)}` }
  let gid: string | null = null
  if (order.method === 'gateway') {
    const g = await gateway()
    if (!g || !order.gatewayPaymentId) return { ok: false, error: 'البوابة غير متاحة لتنفيذ الاسترداد' }
    try {
      gid = (await g.refund(order.gatewayPaymentId, amount)).id
    } catch (e) {
      return { ok: false, error: `رفضت البوابة الاسترداد: ${(e as Error).message}` }
    }
  }
  const refunded = order.refunded + amount
  await db.insert(s.refunds).values({ id: randomUUID(), orderId, amount, reason, gatewayRefundId: gid, by })
  await db.update(s.orders).set({ refunded, status: refunded >= order.total ? 'refunded' : 'partially_refunded', updatedAt: nowIso() }).where(eq(s.orders.id, orderId))
  const [inv] = await db.select().from(s.invoices).where(and(eq(s.invoices.orderId, orderId), eq(s.invoices.kind, 'invoice')))
  await issueInvoice(order, [], 'credit_note', amount, inv?.number)
  if (cancelEnrollments) {
    await db.update(s.enrollments).set({ status: 'canceled', updatedAt: nowIso() }).where(eq(s.enrollments.orderId, orderId))
    await db.delete(s.seatGrants).where(and(eq(s.seatGrants.orderId, orderId), isNull(s.seatGrants.enrollmentId)))
  }
  await audit(by, 'refund', 'order', orderId, `${order.number} · ${(amount / 100).toFixed(2)} ر.س · ${reason}`)
  return { ok: true }
}

/* ───────── قراءة الطلب للمشتري برمز الوصول ───────── */
export async function orderForBuyer(number: string, token: string) {
  const [order] = await db.select().from(s.orders).where(eq(s.orders.number, number))
  if (!order || order.token.length !== token.length) return null
  let diff = 0
  for (let i = 0; i < token.length; i++) diff |= order.token.charCodeAt(i) ^ token.charCodeAt(i)
  if (diff !== 0) return null
  const items = await db.select().from(s.orderItems).where(eq(s.orderItems.orderId, order.id))
  const [course] = items.length ? await db.select().from(s.courses).where(eq(s.courses.id, items[0].courseId)) : []
  const invs = await db.select().from(s.invoices).where(eq(s.invoices.orderId, order.id)).orderBy(asc(s.invoices.issuedAt))
  const expired = order.status === 'pending' && !!order.expiresAt && order.expiresAt < nowIso()
  return { order: expired ? { ...order, status: 'expired' as const } : order, items, course, invoices: invs }
}


/** هل الدفع الإلكتروني مفتوح الآن؟ مفعّل من اللوحة + بوابة مربوطة */
export async function salesOpen() {
  const [st, set] = [(await import('./payments/gateway')).gatewayStatus(), await paymentSettings()]
  return set.enabled && st.configured
}
