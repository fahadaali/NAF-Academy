import 'server-only'
/* منطق البيع على الخادم — التسعير الموثوق، والمقاعد، وإنشاء الطلب، والإتمام الذري، والاسترداد. */
import { randomBytes, randomUUID } from 'node:crypto'
import { and, asc, count, eq, gt, inArray, isNull, lt, or, sql, sum } from 'drizzle-orm'
import { db, schema as s } from './db'
import { audit } from './audit'
import { paymentSettings } from './settings'
import { zatcaTlv } from './payments/zatca'
import { gateway } from './payments/gateway'
import { normalizeCode, quote, type Quote } from '@/lib/quote'
import { normalizePhone } from '@/lib/phone'
import { resolveStatus } from '@/lib/course-meta'
import type { CourseRow, CouponRow, OrderRow, TierRow } from './db/schema'
import { chunksOf } from './db/limits'
import { livePromotions, promosFor } from './promotions'
import { cohortSeatsUsed, holdsSeat, inviteHolds } from './cohorts'
import { accessUntilFor, cohortState, hasAccess } from '@/lib/cohorts'
import type { CohortRow } from './db/schema'

const nowIso = () => new Date().toISOString()
const secretToken = () => randomBytes(18).toString('base64url')

/* ───────── الترقيم الذرّي ───────── */
async function nextNumber(key: string, prefix: string) {
  const [r] = await db.insert(s.counters).values({ key, value: 1 })
    .onConflictDoUpdate({ target: s.counters.key, set: { value: sql`${s.counters.value} + 1` } })
    .returning({ value: s.counters.value })
  /* السنة بتوقيت الرياض: طلب 1 يناير قبل الثالثة فجراً بتوقيت غرينتش يحمل السنة الجديدة */
  return `${prefix}-${new Date(Date.now() + 3 * 3600e3).getUTCFullYear()}-${String(r.value).padStart(6, '0')}`
}

/* ───────── المقاعد ───────── */
/** المشغول = المحجوز يدوياً + التسجيلات النشطة + مقاعد المؤسسات غير المخصّصة + الطلبات المعلّقة السارية + الدعوات المفتوحة */
export async function seatsUsed(course: Pick<CourseRow, 'id' | 'seatsTaken'>, tierId?: string | null) {
  const now = nowIso()
  const [e] = await db.select({ n: count() }).from(s.enrollments)
    .where(and(eq(s.enrollments.courseId, course.id), holdsSeat(now), tierId ? eq(s.enrollments.tierId, tierId) : undefined))
  const [g] = await db.select({ n: count() }).from(s.seatGrants)
    .innerJoin(s.orders, eq(s.orders.id, s.seatGrants.orderId))
    .innerJoin(s.orderItems, and(eq(s.orderItems.orderId, s.orders.id), eq(s.orderItems.courseId, s.seatGrants.courseId)))
    .where(and(eq(s.seatGrants.courseId, course.id), isNull(s.seatGrants.enrollmentId), inArray(s.orders.status, ['paid', 'partially_refunded']), tierId ? eq(s.orderItems.tierId, tierId) : undefined))
  const [p] = await db.select({ n: sum(s.orderItems.quantity) }).from(s.orderItems)
    .innerJoin(s.orders, eq(s.orders.id, s.orderItems.orderId))
    .where(and(eq(s.orderItems.courseId, course.id), eq(s.orders.status, 'pending'), gt(s.orders.expiresAt, now), tierId ? eq(s.orderItems.tierId, tierId) : undefined))
  /* الدعوة بلا باقة — تُحسب في سعة الدورة لا في سعة باقة */
  const [i] = tierId ? [{ n: 0 }] : await db.select({ n: count() }).from(s.invitations).where(and(eq(s.invitations.courseId, course.id), inviteHolds(now)))
  return (tierId ? 0 : course.seatsTaken) + e.n + g.n + Number(p.n ?? 0) + i.n
}

/** هل في الدورة (أو دفعتها) متّسع لـ n مقعداً إضافياً؟ يعيد رسالة الرفض أو null */
export async function noRoom(course: Pick<CourseRow, 'id' | 'seatsTaken' | 'seatsTotal'>, cohort: Pick<CohortRow, 'id' | 'seatsTaken' | 'seatsTotal'> | null, n = 1): Promise<string | null> {
  if (n <= 0) return null
  const full = n === 1 ? 'اكتملت المقاعد' : 'لم تعد المقاعد المتبقية تكفي هذا العدد'
  if (cohort) return cohort.seatsTotal !== null && (await cohortSeatsUsed(cohort)) + n > cohort.seatsTotal ? full : null
  return course.seatsTotal !== null && (await seatsUsed(course)) + n > course.seatsTotal ? full : null
}

/** بعد الحجز: هل تجاوز المشغول السعة؟ (يتراجع المتأخر في سباق على آخر مقعد) */
export async function overCapacity(course: Pick<CourseRow, 'id' | 'seatsTaken' | 'seatsTotal'>, cohort: Pick<CohortRow, 'id' | 'seatsTaken' | 'seatsTotal'> | null, own = 0) {
  if (cohort) return cohort.seatsTotal !== null && (await cohortSeatsUsed(cohort)) - own > cohort.seatsTotal
  return course.seatsTotal !== null && (await seatsUsed(course)) - own > course.seatsTotal
}

/* ───────── الكوبون ───────── */
async function findCoupon(code: string) {
  const c = normalizeCode(code)
  if (!c) return null
  const [row] = await db.select().from(s.coupons).where(and(eq(s.coupons.code, c), isNull(s.coupons.deletedAt)))
  return row ?? null
}

/** الاستخدامات = المسترد فعلاً + الطلبات المعلّقة السارية التي تحمل الكوبون (حتى لا يُتجاوز الحد بالتوازي) */
async function couponUses(couponId: string, email?: string) {
  const now = nowIso()
  const [t] = await db.select({ n: count() }).from(s.couponRedemptions).where(eq(s.couponRedemptions.couponId, couponId))
  const [h] = await db.select({ n: count() }).from(s.orders).where(and(eq(s.orders.couponId, couponId), eq(s.orders.status, 'pending'), gt(s.orders.expiresAt, now)))
  let mine = 0
  if (email) {
    const e = email.toLowerCase()
    const [m] = await db.select({ n: count() }).from(s.couponRedemptions)
      .innerJoin(s.learners, eq(s.learners.id, s.couponRedemptions.learnerId))
      .where(and(eq(s.couponRedemptions.couponId, couponId), eq(s.learners.email, e)))
    const [mh] = await db.select({ n: count() }).from(s.orders)
      .innerJoin(s.learners, eq(s.learners.id, s.orders.learnerId))
      .where(and(eq(s.orders.couponId, couponId), eq(s.orders.status, 'pending'), gt(s.orders.expiresAt, now), eq(s.learners.email, e)))
    mine = m.n + mh.n
  }
  return { total: t.n + h.n, byLearner: mine }
}

/* ───────── التسعير الموثوق ───────── */
export type PricedCourse = { course: CourseRow; tier: TierRow | null; tiers: TierRow[]; coupon: CouponRow | null; q: Quote }

/** دفعات الدورة غير المحذوفة — الدورة ذات الدفعات تشترط اختيار إحداها */
async function courseCohortRows(courseId: string) {
  return db.select().from(s.cohorts).where(and(eq(s.cohorts.courseId, courseId), isNull(s.cohorts.deletedAt))).orderBy(asc(s.cohorts.sortOrder))
}

/** نهاية وصول تسجيل جديد في الدورة (ودفعتها إن وُجدت) */
export async function accessUntilOf(courseId: string, cohortId: string | null | undefined) {
  const [c] = await db.select({ days: s.courses.accessDays }).from(s.courses).where(eq(s.courses.id, courseId))
  if (!c?.days) return null
  const [k] = cohortId ? await db.select({ endsAt: s.cohorts.endsAt }).from(s.cohorts).where(eq(s.cohorts.id, cohortId)) : []
  return accessUntilFor(c.days, k?.endsAt)
}

export async function priceFor(slug: string, opts: { tierId?: string | null; quantity: number; code?: string; email?: string }): Promise<PricedCourse | null> {
  const [course] = await db.select().from(s.courses).where(and(eq(s.courses.slug, slug), isNull(s.courses.deletedAt)))
  if (!course) return null
  const tiers = await db.select().from(s.priceTiers).where(eq(s.priceTiers.courseId, course.id)).orderBy(asc(s.priceTiers.sortOrder))
  const tier = tiers.length ? tiers.find((t) => t.id === opts.tierId) ?? tiers.find((t) => t.highlight) ?? tiers[0] : null
  const rules = await db.select().from(s.groupRules).where(eq(s.groupRules.courseId, course.id))
  const coupon = opts.code ? await findCoupon(opts.code) : null
  const settings = await paymentSettings()
  const promos = promosFor(course, await livePromotions())
  const q = quote({
    price: tier
      ? { amount: tier.price, compareAt: tier.compareAt, saleStartsAt: course.saleStartsAt, saleEndsAt: course.saleEndsAt, promos }
      : { amount: course.price, compareAt: course.compareAt, saleStartsAt: course.saleStartsAt, saleEndsAt: course.saleEndsAt, free: course.free, promos },
    quantity: opts.quantity, groupRules: rules, coupon, uses: coupon ? await couponUses(coupon.id, opts.email) : undefined,
    email: opts.email, courseId: course.id, trackId: course.trackId, vatRate: settings.vatRate,
  })
  if (opts.code && !coupon) q.couponError = 'رمز الكوبون غير صحيح'
  return { course, tier, tiers, coupon, q }
}

/* ───────── المتدرب ───────── */
/** ينشئ المتدرب أو يكمل بياناته. `trusted`: صاحب الحساب نفسه بعد التحقق، أو موظف من اللوحة —
    وحده يغيّر الاسم والجوال القائمين. غيره (مسؤول مؤسسة يخصّص مقعداً، أو شراء بلا تحقق) يملأ الفارغ فقط،
    فلا يُكتب اسم خاطئ على شهادة أحد، ولا يُربط جوال غريب بحسابه (الدخول بالجوال). */
export async function upsertLearner(b: { name: string; email: string; phone: string; org: string; vatNumber: string; nameEn?: string }, opts: { trusted?: boolean } = {}) {
  const email = b.email.trim().toLowerCase()
  const phone = b.phone ? normalizePhone(b.phone) ?? b.phone.trim() : ''
  const name = b.name.trim()
  const phoneFree = async (selfId?: string) => {
    if (!phone) return false
    const [other] = await db.select({ id: s.learners.id }).from(s.learners).where(eq(s.learners.phone, phone))
    return !other || other.id === selfId
  }
  const [old] = await db.select().from(s.learners).where(eq(s.learners.email, email))
  if (!old) {
    const [row] = await db.insert(s.learners).values({ id: randomUUID(), name: name || email.split('@')[0], email, phone: (await phoneFree()) ? phone : '', org: b.org, vatNumber: b.vatNumber, nameEn: b.nameEn?.trim() ?? '' })
      .onConflictDoNothing({ target: s.learners.email }).returning()
    if (row) return row
    const [again] = await db.select().from(s.learners).where(eq(s.learners.email, email))
    return again
  }
  /* الاسم الافتراضي (ما قبل @) يُعامل كفارغ */
  const blankName = !old.name || old.name === email.split('@')[0]
  const patch: Partial<typeof s.learners.$inferInsert> = {}
  if (name && name !== old.name && (opts.trusted || blankName)) patch.name = name
  if (phone && phone !== old.phone && (opts.trusted || !old.phone) && (await phoneFree(old.id))) patch.phone = phone
  if (b.org && b.org !== old.org && (opts.trusted || !old.org)) patch.org = b.org
  if (b.vatNumber && b.vatNumber !== old.vatNumber && (opts.trusted || !old.vatNumber)) patch.vatNumber = b.vatNumber
  const nameEn = b.nameEn?.trim() ?? ''
  if (nameEn && nameEn !== old.nameEn && (opts.trusted || !old.nameEn)) patch.nameEn = nameEn
  if (!Object.keys(patch).length) return old
  const [row] = await db.update(s.learners).set({ ...patch, updatedAt: nowIso() }).where(eq(s.learners.id, old.id)).returning()
  return row
}

/* ───────── إنشاء الطلب ───────── */
export type Buyer = { name: string; email: string; phone: string; org: string; vatNumber: string }

export type PlaceResult =
  | { ok: true; order: OrderRow; free: boolean }
  | { ok: false; error: string }

async function cancelOwn(id: string, why: string) {
  await db.update(s.orders).set({ status: 'canceled', note: why, updatedAt: nowIso() }).where(and(eq(s.orders.id, id), eq(s.orders.status, 'pending')))
}

export async function placeOrder(p: { slug: string; tierId?: string | null; cohortId?: string | null; quantity: number; code?: string; buyer: Buyer; attendSelf: boolean; method?: OrderRow['method']; by?: string; note?: string; skipPaymentsCheck?: boolean; trusted?: boolean }): Promise<PlaceResult> {
  const priced = await priceFor(p.slug, { tierId: p.tierId, quantity: p.quantity, code: p.code, email: p.buyer.email })
  if (!priced) return { ok: false, error: 'الدورة غير موجودة' }
  const { course, tier, coupon, q } = priced
  /* البرنامج الخاص لا يُشترى — يُسجَّل فيه من اللوحة أو بدعوة */
  if (!p.by && course.visibility === 'private') return { ok: false, error: 'التسجيل في هذا البرنامج من الإدارة أو بدعوة فقط' }
  const email = p.buyer.email.trim().toLowerCase()
  const [known] = await db.select().from(s.learners).where(eq(s.learners.email, email))
  /* مسجّل في الدورة؟ لا يُشترى المقعد مرتين (إلا طلب مقاعد لفريق لا يحضر صاحبه).
     والمنتهي وصوله يجدّد دائماً — ولو أُغلق التسجيل أو امتلأ — فيمتدّ تسجيله نفسه ولا يأخذ مقعداً جديداً */
  const [mine] = known && (q.quantity === 1 || p.attendSelf)
    ? await db.select().from(s.enrollments).where(and(eq(s.enrollments.learnerId, known.id), eq(s.enrollments.courseId, course.id), eq(s.enrollments.status, 'active')))
    : []
  if (mine && hasAccess(mine)) return { ok: false, error: p.by ? 'هذا المتدرب مسجّل في الدورة من قبل' : 'أنت مسجّل في هذه الدورة بالفعل — تجدها في «دوراتي»' }
  const renewing = !!mine
  const status = resolveStatus(course.status, course.publishAt)
  if (!p.by && !renewing && status !== 'open') return { ok: false, error: 'التسجيل غير متاح في هذه الدورة الآن' }
  if (p.code && q.couponError) return { ok: false, error: q.couponError }
  /* الدورة ذات الدفعات: دفعة من دفعاتها، مفتوحة للزائر (والموظف يسجّل في أي دفعة غير منتهية).
     المجدِّد يبقى في دفعته إن لم يختر غيرها */
  const cohortRows = await courseCohortRows(course.id)
  let cohort: CohortRow | null = null
  if (cohortRows.length) {
    cohort = cohortRows.find((k) => k.id === (p.cohortId ?? (renewing ? mine.cohortId : null))) ?? null
    if (!cohort) return { ok: false, error: 'اختر الدفعة' }
    const st = cohortState({ ...cohort, taken: 0 })
    const stays = renewing && cohort.id === mine.cohortId
    if (!stays && (st === 'closed' || (!p.by && st !== 'open'))) return { ok: false, error: `التسجيل في «${cohort.title}» غير متاح الآن` }
  }
  /* مقعد المجدِّد قائم إن بقي في دفعته (أو في دورة بلا دفعات) — فلا يُحسب من السعة */
  const ownSeat = renewing && (!cohortRows.length || cohort?.id === mine.cohortId) ? 1 : 0

  const settings = await paymentSettings()
  const method = p.method ?? (q.free ? (q.couponApplied ? 'grant' : 'free') : 'gateway')
  if (method === 'gateway' && !p.skipPaymentsCheck) {
    const g = await gateway()
    if (!settings.enabled || !g) return { ok: false, error: 'الدفع الإلكتروني غير مفعّل بعد' }
  }

  /* طلب معلّق سابق للمشتري نفسه في الدورة نفسها يُلغى قبل حساب المقاعد — حجز واحد لكل مشترٍ، ولا يحجب حجزُه طلبَه الجديد */
  if (known && !p.by) {
    await db.update(s.orders).set({ status: 'canceled', note: 'استُبدل بطلب أحدث', updatedAt: nowIso() })
      .where(and(eq(s.orders.learnerId, known.id), eq(s.orders.status, 'pending'),
        inArray(s.orders.id, db.select({ id: s.orderItems.orderId }).from(s.orderItems).where(eq(s.orderItems.courseId, course.id)))))
  }

  const full = 'لم تعد المقاعد المتبقية تكفي هذا العدد'
  const need = q.quantity - ownSeat
  const room = await noRoom(course, cohort, need)
  if (room) return { ok: false, error: room }
  if (need > 0 && tier?.capacity != null && (await seatsUsed(course, tier.id)) + need > tier.capacity) return { ok: false, error: `اكتملت مقاعد باقة «${tier.name}»` }

  const learner = await upsertLearner(p.buyer, { trusted: p.trusted || !!p.by })
  const grant = p.method === 'grant'
  const id = randomUUID()
  const order = {
    id, number: await nextNumber('order', settings.orderPrefix), token: secretToken(), learnerId: learner.id,
    status: 'pending' as const, method, buyer: { ...p.buyer, email: learner.email },
    subtotal: grant ? 0 : q.subtotal, groupDiscount: grant ? 0 : q.groupDiscount, couponDiscount: grant ? 0 : q.couponDiscount, total: grant ? 0 : q.total, vat: grant ? 0 : q.vat, vatRate: settings.vatRate,
    couponId: q.couponApplied && !grant ? coupon!.id : null, couponCode: q.couponApplied && !grant ? coupon!.code : '',
    expiresAt: new Date(Date.now() + settings.holdMinutes * 60e3).toISOString(),
    attendSelf: q.quantity === 1 ? true : p.attendSelf, createdBy: p.by ?? 'web', note: p.note ?? '',
  }
  await db.insert(s.orders).values(order)
  await db.insert(s.orderItems).values({
    id: randomUUID(), orderId: id, courseId: course.id, tierId: tier?.id ?? null, cohortId: cohort?.id ?? null,
    title: cohort ? `${course.title} — ${cohort.title}` : course.title, tierName: tier?.name ?? '',
    unitPrice: grant ? 0 : q.unit, listPrice: q.unitList, quantity: q.quantity, lineTotal: grant ? 0 : q.subtotal,
  })

  /* تحقق بعد الإدراج: إن تسابق طلبان على آخر مقعد أو آخر استخدام للكوبون، يتراجع المتأخر */
  /* الطلب المعلّق نفسه محسوب الآن في المشغول؛ مقعد المجدِّد القائم يُطرح منه */
  if (need > 0 && (await overCapacity(course, cohort, ownSeat))) { await cancelOwn(id, full); return { ok: false, error: full } }
  if (need > 0 && tier?.capacity != null && (await seatsUsed(course, tier.id)) - ownSeat > tier.capacity) { await cancelOwn(id, 'سعة الباقة'); return { ok: false, error: `اكتملت مقاعد باقة «${tier.name}»` } }
  if (order.couponId && coupon) {
    const u = await couponUses(coupon.id, learner.email)
    if ((coupon.maxUses !== null && u.total > coupon.maxUses) || (coupon.maxPerLearner !== null && u.byLearner > coupon.maxPerLearner)) {
      await cancelOwn(id, 'استُنفد الكوبون')
      return { ok: false, error: 'استُنفد هذا الكوبون للتو' }
    }
  }

  await audit(p.by ?? learner.email, 'order', 'order', id, `${order.number} · ${course.title}`)
  if (method !== 'gateway') {
    await finalizeOrder(id, { method })
    const [done] = await db.select().from(s.orders).where(eq(s.orders.id, id))
    return { ok: true, order: done, free: true }
  }
  const [row] = await db.select().from(s.orders).where(eq(s.orders.id, id))
  return { ok: true, order: row, free: false }
}

/* ───────── الإتمام ─────────
   المطالبة ذرّية (UPDATE … WHERE status IN … RETURNING) فلا يُدفع الطلب مرتين،
   والتنفيذ بعدها خطوات متكرّرة الأمان تُستأنف إن انقطعت (fulfilledAt). */
export async function finalizeOrder(orderId: string, info: { method: OrderRow['method']; paymentId?: string; by?: string }): Promise<'done' | 'already'> {
  const paidAt = nowIso()
  const claimed = await db.update(s.orders)
    .set({ status: 'paid', paidAt, method: info.method, gatewayPaymentId: info.paymentId ?? null, updatedAt: paidAt })
    .where(and(eq(s.orders.id, orderId), inArray(s.orders.status, ['pending', 'expired', 'failed'])))
    .returning()
  if (claimed.length) {
    await audit(info.by ?? 'system', 'paid', 'order', orderId, `${claimed[0].number} · ${(claimed[0].total / 100).toFixed(2)} ر.س · ${info.method}`)
  }
  /* من يضع fulfillingAt وحده يُنفّذ — عودة المتصفح وWebhook قد يصلان معاً. والمطالبة تنتهي بعد خمس دقائق إن انقطع التنفيذ */
  const stale = new Date(Date.now() - 5 * 60e3).toISOString()
  const [mine] = await db.update(s.orders).set({ fulfillingAt: nowIso() })
    .where(and(eq(s.orders.id, orderId), isNull(s.orders.fulfilledAt), inArray(s.orders.status, ['paid', 'partially_refunded']),
      or(isNull(s.orders.fulfillingAt), lt(s.orders.fulfillingAt, stale))))
    .returning()
  if (mine) await fulfill(mine)
  return claimed.length ? 'done' : 'already'
}

async function fulfill(order: OrderRow) {
  const items = await db.select().from(s.orderItems).where(eq(s.orderItems.orderId, order.id))
  const source = order.method === 'gateway' ? 'purchase' : order.method === 'grant' ? 'grant' : order.method === 'free' ? 'free' : 'manual'
  const [hasEnroll] = await db.select({ n: count() }).from(s.enrollments).where(eq(s.enrollments.orderId, order.id))
  const [hasGrant] = await db.select({ n: count() }).from(s.seatGrants).where(eq(s.seatGrants.orderId, order.id))
  const created: string[] = []
  if (!hasEnroll.n && !hasGrant.n) {
    for (const it of items) {
      const accessUntil = await accessUntilOf(it.courseId, it.cohortId)
      if (it.quantity === 1) {
        const eid = randomUUID()
        const ins = await db.insert(s.enrollments).values({ id: eid, learnerId: order.learnerId, courseId: it.courseId, tierId: it.tierId, cohortId: it.cohortId, orderId: order.id, source, accessUntil })
          .onConflictDoNothing().returning({ id: s.enrollments.id })
        if (ins.length) { created.push(eid); continue }
        /* تجديد وصول منتهٍ: يمتدّ التسجيل القائم بدل تسجيل ثانٍ */
        const [cur] = await db.select().from(s.enrollments).where(and(eq(s.enrollments.learnerId, order.learnerId), eq(s.enrollments.courseId, it.courseId), eq(s.enrollments.status, 'active')))
        if (cur && !hasAccess(cur)) {
          await db.update(s.enrollments).set({ accessUntil, orderId: order.id, cohortId: it.cohortId ?? cur.cohortId, updatedAt: nowIso() }).where(eq(s.enrollments.id, cur.id))
          await audit('system', 'renew', 'enrollment', cur.id, `${order.number}: تجديد الوصول`)
        } else await audit('system', 'needs_attention', 'order', order.id, `${order.number}: المشتري مسجّل في الدورة من قبل — راجع الاسترداد`)
        continue
      }
      const grants = Array.from({ length: it.quantity }, () => ({ id: randomUUID(), orderId: order.id, courseId: it.courseId, cohortId: it.cohortId, email: null as string | null, enrollmentId: null as string | null }))
      if (order.attendSelf) {
        /* المشتري يحضر بنفسه: تسجيل جديد، أو تجديد تسجيله المنتهي (لا تسجيل ثانٍ يكسر الفهرس الفريد) */
        const [cur] = await db.select().from(s.enrollments).where(and(eq(s.enrollments.learnerId, order.learnerId), eq(s.enrollments.courseId, it.courseId), eq(s.enrollments.status, 'active')))
        const eid = cur ? cur.id : randomUUID()
        grants[0].email = order.buyer.email
        grants[0].enrollmentId = eid
        if (cur) {
          await db.batch([
            db.update(s.enrollments).set({ accessUntil, orderId: order.id, cohortId: it.cohortId ?? cur.cohortId, updatedAt: nowIso() }).where(eq(s.enrollments.id, cur.id)),
            ...chunksOf(s.seatGrants, grants).map((part) => db.insert(s.seatGrants).values(part)),
          ])
          await audit('system', 'renew', 'enrollment', cur.id, `${order.number}: تجديد الوصول`)
        } else {
          await db.batch([
            db.insert(s.enrollments).values({ id: eid, learnerId: order.learnerId, courseId: it.courseId, tierId: it.tierId, cohortId: it.cohortId, orderId: order.id, source: 'seat', accessUntil }),
            ...chunksOf(s.seatGrants, grants).map((part) => db.insert(s.seatGrants).values(part)),
          ])
          created.push(eid)
        }
      } else for (const part of chunksOf(s.seatGrants, grants)) await db.insert(s.seatGrants).values(part)
    }
  }
  if (order.couponId) {
    await db.insert(s.couponRedemptions).values({ id: randomUUID(), couponId: order.couponId, orderId: order.id, learnerId: order.learnerId, amount: order.couponDiscount })
      .onConflictDoNothing({ target: s.couponRedemptions.orderId })
  }
  if (order.total > 0) {
    const [inv] = await db.select({ id: s.invoices.id }).from(s.invoices).where(and(eq(s.invoices.orderId, order.id), eq(s.invoices.kind, 'invoice')))
    if (!inv) await issueInvoice(order, items, 'invoice')
  }
  await db.update(s.orders).set({ fulfilledAt: nowIso(), fulfillingAt: null }).where(eq(s.orders.id, order.id))
  /* رسالة الترحيب لكل تسجيل جديد، وتأكيد الطلب بالفاتورة للمشتري (ولو لم يحضر) — فشلها لا يوقف الإتمام */
  const { onEnrolled, onOrderPaid } = await import('./notify/engine')
  for (const id of created) await onEnrolled(id)
  if (order.total > 0) await onOrderPaid(order.id)
}

/* ───────── الفواتير ───────── */
async function issueInvoice(order: OrderRow, items: { title: string; tierName: string; quantity: number; unitPrice: number; lineTotal: number }[], kind: 'invoice' | 'credit_note', amount?: number, refOf?: string) {
  const settings = await paymentSettings()
  const issuedAt = nowIso()
  const total = kind === 'invoice' ? order.total : amount!
  /* الضريبة من الطلب نفسه لا من الإعداد الحالي */
  const vat = kind === 'invoice' ? order.vat : Math.round((total * order.vatRate) / (100 + order.vatRate))
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
/** استرداد تلقائي لدفعة مقبوضة لا يمكن إتمام طلبها (ملغى، مبلغ مختلف، عدد اكتمل) */
async function refundOrphan(gatewayPaymentId: string, amount: number, orderId: string, why: string) {
  const g = await gateway()
  try {
    if (g) await g.refund(gatewayPaymentId, amount)
    await audit('system', 'auto_refund', 'order', orderId, `استرداد تلقائي ${(amount / 100).toFixed(2)} ر.س — ${why}`)
  } catch (e) {
    await audit('system', 'needs_attention', 'order', orderId, `دفعة مقبوضة تحتاج استرداداً يدوياً (${gatewayPaymentId}): ${why} — ${(e as Error).message}`)
  }
}

/** يجلب الدفعة من البوابة نفسها (لا يثق بما يرسله المتصفح)، ويشترط أن تحمل رقم هذا الطلب تحديداً */
export async function confirmPayment(paymentId: string, expectOrderId?: string): Promise<{ order: OrderRow | null; outcome: 'paid' | 'failed' | 'mismatch' | 'unknown' }> {
  const g = await gateway()
  if (!g) return { order: null, outcome: 'unknown' }
  const p = await g.fetchPayment(paymentId)
  /* الدفعة بلا رقم طلب أو لطلب آخر لا تُقبل أبداً — وإلا دفعت دفعةٌ واحدة لعدة طلبات */
  if (!p.orderId || (expectOrderId && p.orderId !== expectOrderId)) return { order: null, outcome: 'mismatch' }
  const [order] = await db.select().from(s.orders).where(eq(s.orders.id, p.orderId))
  if (!order) return { order: null, outcome: 'mismatch' }
  const [prior] = await db.select().from(s.payments).where(eq(s.payments.gatewayId, p.id))
  if (prior && prior.orderId !== order.id) return { order, outcome: 'mismatch' }
  const captured = p.status === 'paid' || p.status === 'captured'
  await db.insert(s.payments).values({ id: randomUUID(), orderId: order.id, gateway: g.kind, gatewayId: p.id, status: p.status, amount: p.amount, method: p.method, message: p.message })
    .onConflictDoUpdate({ target: s.payments.gatewayId, set: { status: p.status, message: p.message, updatedAt: nowIso() } })

  if (p.amount !== order.total || p.currency.toUpperCase() !== 'SAR') {
    await audit('system', 'mismatch', 'order', order.id, `مبلغ الدفعة ${p.amount} لا يطابق ${order.total}`)
    if (captured && !prior) await refundOrphan(p.id, p.amount, order.id, 'مبلغ لا يطابق الطلب')
    return { order, outcome: 'mismatch' }
  }
  if (!captured) return { order, outcome: p.status === 'failed' ? 'failed' : 'unknown' }

  if (['paid', 'partially_refunded', 'refunded'].includes(order.status)) {
    if (order.gatewayPaymentId && order.gatewayPaymentId !== p.id && !prior) await refundOrphan(p.id, p.amount, order.id, 'دفعة مكرّرة لطلب مدفوع')
    else await finalizeOrder(order.id, { method: 'gateway', paymentId: p.id })
    const [fresh] = await db.select().from(s.orders).where(eq(s.orders.id, order.id))
    return { order: fresh, outcome: 'paid' }
  }
  if (order.status === 'canceled') {
    if (!prior) await refundOrphan(p.id, p.amount, order.id, 'دُفع بعد إلغاء الطلب')
    return { order, outcome: 'mismatch' }
  }
  /* بعد انتهاء المهلة: لا يُقبل إلا إن بقيت المقاعد */
  if (order.expiresAt && order.expiresAt < nowIso()) {
    const items = await db.select().from(s.orderItems).where(eq(s.orderItems.orderId, order.id))
    let why = ''
    for (const it of items) {
      const [c] = await db.select().from(s.courses).where(eq(s.courses.id, it.courseId))
      const [t] = it.tierId ? await db.select().from(s.priceTiers).where(eq(s.priceTiers.id, it.tierId)) : []
      const [k] = it.cohortId ? await db.select().from(s.cohorts).where(eq(s.cohorts.id, it.cohortId)) : []
      if (k?.seatsTotal != null && (await cohortSeatsUsed(k)) + it.quantity > k.seatsTotal) why = 'اكتمل العدد بعد انتهاء مهلة الحجز'
      else if (!k && c?.seatsTotal != null && (await seatsUsed(c)) + it.quantity > c.seatsTotal) why = 'اكتمل العدد بعد انتهاء مهلة الحجز'
      else if (c && t?.capacity != null && (await seatsUsed(c, t.id)) + it.quantity > t.capacity) why = 'اكتملت الباقة بعد انتهاء مهلة الحجز'
    }
    if (!why && order.couponId) {
      const [cp] = await db.select().from(s.coupons).where(eq(s.coupons.id, order.couponId))
      const u = cp ? await couponUses(cp.id, order.buyer.email) : null
      if (cp && u && ((cp.maxUses !== null && u.total >= cp.maxUses) || (cp.maxPerLearner !== null && u.byLearner >= cp.maxPerLearner))) why = 'استُنفد الكوبون بعد انتهاء مهلة الحجز'
    }
    if (why) {
      const [gone] = await db.update(s.orders).set({ status: 'canceled', note: why, updatedAt: nowIso() })
        .where(and(eq(s.orders.id, order.id), inArray(s.orders.status, ['pending', 'expired', 'failed']))).returning({ id: s.orders.id })
      if (gone) await refundOrphan(p.id, p.amount, order.id, why)
      return { order, outcome: 'mismatch' }
    }
  }
  await finalizeOrder(order.id, { method: 'gateway', paymentId: p.id })
  const [fresh] = await db.select().from(s.orders).where(eq(s.orders.id, order.id))
  return { order: fresh, outcome: 'paid' }
}

/* ───────── الاسترداد ─────────
   الحجز الذرّي للمبلغ أولاً (refunded = refunded + x بشرط ألا يتجاوز الإجمالي)، ثم البوابة،
   ويُعاد المبلغ إن رفضت البوابة — فلا يضيع استرداد في التوازي ولا يتجاوز الإجمالي. */
export async function refundOrder(orderId: string, amount: number, reason: string, cancelEnrollments: boolean, by: string): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, error: 'مبلغ غير صالح' }
  const [held] = await db.update(s.orders)
    .set({ refunded: sql`${s.orders.refunded} + ${amount}`, updatedAt: nowIso() })
    .where(and(eq(s.orders.id, orderId), inArray(s.orders.status, ['paid', 'partially_refunded']), sql`${s.orders.refunded} + ${amount} <= ${s.orders.total}`))
    .returning()
  if (!held) {
    const [o] = await db.select().from(s.orders).where(eq(s.orders.id, orderId))
    if (!o || !['paid', 'partially_refunded'].includes(o.status)) return { ok: false, error: 'الطلب غير قابل للاسترداد' }
    return { ok: false, error: `المبلغ يتجاوز المتبقي (${((o.total - o.refunded) / 100).toFixed(2)} ر.س)` }
  }
  let gid: string | null = null
  if (held.method === 'gateway') {
    const g = await gateway()
    try {
      if (!g || !held.gatewayPaymentId) throw new Error('البوابة غير متاحة')
      gid = (await g.refund(held.gatewayPaymentId, amount)).id
    } catch (e) {
      await db.update(s.orders).set({ refunded: sql`${s.orders.refunded} - ${amount}` }).where(eq(s.orders.id, orderId))
      return { ok: false, error: `رفضت البوابة الاسترداد: ${(e as Error).message}` }
    }
  }
  await db.update(s.orders).set({ status: sql`case when ${s.orders.refunded} >= ${s.orders.total} then 'refunded' else 'partially_refunded' end` }).where(eq(s.orders.id, orderId))
  const refundId = randomUUID()
  await db.insert(s.refunds).values({ id: refundId, orderId, amount, reason, gatewayRefundId: gid, by })
  const [inv] = await db.select().from(s.invoices).where(and(eq(s.invoices.orderId, orderId), eq(s.invoices.kind, 'invoice')))
  await issueInvoice(held, [], 'credit_note', amount, inv?.number)
  if (cancelEnrollments) {
    await db.update(s.enrollments).set({ status: 'canceled', updatedAt: nowIso() }).where(eq(s.enrollments.orderId, orderId))
    await db.delete(s.seatGrants).where(and(eq(s.seatGrants.orderId, orderId), isNull(s.seatGrants.enrollmentId)))
  }
  await audit(by, 'refund', 'order', orderId, `${held.number} · ${(amount / 100).toFixed(2)} ر.س · ${reason}`)
  /* إشعار المشتري بالمبلغ والإشعار الدائن — فشله لا يُبطل الاسترداد */
  const { onRefund } = await import('./notify/engine')
  await onRefund(orderId, refundId)
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
