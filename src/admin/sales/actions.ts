'use server'
import { assignSeatCore } from '@/server/seats'
/* إجراءات المبيعات في اللوحة — الإعدادات، والكوبونات، والاسترداد، والطلب اليدوي، وتخصيص المقاعد. */
import { randomBytes, randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema as s } from '@/server/db'
import { courseScope, inScope, requirePermission } from '@/server/auth'
import { audit } from '@/server/audit'
import { gatewayStatus } from '@/server/payments/gateway'
import { paymentSettings, setSetting, type PaymentSettings } from '@/server/settings'
import { noRoom, placeOrder, refundOrder } from '@/server/sales'
import { contractState, contractUsed } from '@/server/contracts'
import { normalizeCode } from '@/lib/quote'
import { COUPON_KIND, COUPON_SCOPE } from '@/server/db/schema'
import { errorsOf, type Result } from '@/admin/schemas'
import { chunksOf } from '@/server/db/limits'
import type { WafeqSettings } from '@/lib/wafeq'
import { wafeqCatalog, wafeqSettings, wafeqState, type WafeqCatalog } from '@/server/wafeq/client'
import { resyncInvoice } from '@/server/wafeq/sync'

const iso = z.string().datetime({ offset: true }).nullable()
/** معرّفات الكتابة تُفحص قبل أي استعلام — قاعدة «تحقق قبل الكتابة» */
const uuid = z.string().uuid()
const validId = (v: unknown): v is string => uuid.safeParse(v).success

/* ───────── إعدادات الدفع ───────── */

const settingsInput = z.object({
  enabled: z.boolean(),
  methods: z.array(z.enum(['creditcard', 'applepay', 'stcpay'])).min(1, 'اختر وسيلة واحدة على الأقل'),
  holdMinutes: z.number().int().min(10).max(120),
  vatRate: z.number().min(0).max(30),
  seller: z.object({
    /* رمز QR الضريبي (TLV) يقبل 255 بايتاً للحقل — والحرف العربي بايتان: الحد بالبايت لا بالحرف */
    name: z.string().trim().min(3).max(200).refine((v) => new TextEncoder().encode(v).length <= 255, 'الاسم أطول مما يقبله رمز الفاتورة (255 بايتاً)'),
    vatNumber: z.union([z.literal(''), z.string().regex(/^3\d{13}3$/, 'الرقم الضريبي 15 رقماً يبدأ وينتهي بـ 3')]),
    crNumber: z.string().trim().max(20),
    address: z.string().trim().max(300),
  }),
  orderPrefix: z.string().regex(/^[A-Z]{1,6}$/, 'حروف إنجليزية كبيرة'),
  invoicePrefix: z.string().regex(/^[A-Z]{1,6}$/, 'حروف إنجليزية كبيرة'),
  refundPolicy: z.string().max(3000),
  terms: z.string().max(3000),
})

export async function savePaymentSettings(raw: PaymentSettings): Promise<Result> {
  const admin = await requirePermission('payments.manage')
  const p = settingsInput.safeParse(raw)
  if (!p.success) return { ok: false, errors: errorsOf(p.error), message: 'راجع الحقول' }
  const st = gatewayStatus()
  if (p.data.enabled && !st.configured) return { ok: false, errors: { enabled: st.problem ?? 'البوابة غير مربوطة' }, message: 'لا يمكن التفعيل قبل ربط البوابة' }
  if (p.data.enabled && !p.data.seller.vatNumber && st.mode === 'live') return { ok: false, errors: { 'seller.vatNumber': 'مطلوب قبل التفعيل في الإنتاج' }, message: 'أكمل بيانات الفاتورة' }
  const before = await paymentSettings()
  await setSetting('payments', p.data)
  await audit(admin.name, before.enabled !== p.data.enabled ? (p.data.enabled ? 'enable' : 'disable') : 'update', 'payments', 'settings',
    before.enabled !== p.data.enabled ? (p.data.enabled ? 'تفعيل الدفع الإلكتروني' : 'إيقاف الدفع الإلكتروني') : 'إعدادات الدفع', p.data)
  revalidatePath('/', 'layout')
  return { ok: true, id: 'payments' }
}

/* ───────── الكوبونات ───────── */

const couponInput = z.object({
  code: z.string().transform(normalizeCode).pipe(z.string().min(3, 'الرمز 3 أحرف على الأقل')),
  label: z.string().trim().max(120),
  kind: z.enum(COUPON_KIND),
  value: z.number().int().min(1),
  scope: z.enum(COUPON_SCOPE),
  courseIds: z.array(z.string()).max(200),
  trackIds: z.array(z.string()).max(50),
  startsAt: iso,
  endsAt: iso,
  maxUses: z.number().int().min(1).nullable(),
  maxPerLearner: z.number().int().min(1).nullable(),
  minAmount: z.number().int().min(0).nullable(),
  emailDomain: z.string().trim().toLowerCase().transform((d) => d.replace(/^@/, '')).pipe(z.union([z.literal(''), z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, 'نطاق غير صالح')])),
  stackWithSale: z.boolean(),
  active: z.boolean(),
}).superRefine((v, ctx) => {
  if (v.kind === 'percent' && v.value > 100) ctx.addIssue({ code: 'custom', path: ['value'], message: 'النسبة حتى 100' })
  if (v.scope === 'courses' && !v.courseIds.length) ctx.addIssue({ code: 'custom', path: ['courseIds'], message: 'اختر دورة واحدة على الأقل' })
  if (v.scope === 'tracks' && !v.trackIds.length) ctx.addIssue({ code: 'custom', path: ['trackIds'], message: 'اختر مساراً واحداً على الأقل' })
  if (v.startsAt && v.endsAt && v.endsAt < v.startsAt) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'النهاية قبل البداية' })
})
export type CouponInput = z.input<typeof couponInput>

export async function saveCoupon(id: string | null, raw: CouponInput): Promise<Result> {
  const admin = await requirePermission('sales.coupons')
  if (id !== null && !validId(id)) return { ok: false, errors: {}, message: 'طلب غير صالح' }
  const p = couponInput.safeParse(raw)
  if (!p.success) return { ok: false, errors: errorsOf(p.error), message: 'راجع الحقول' }
  const cid = id ?? randomUUID()
  try {
    if (id) await db.update(s.coupons).set({ ...p.data, updatedAt: new Date().toISOString() }).where(eq(s.coupons.id, id))
    else await db.insert(s.coupons).values({ ...p.data, id: cid })
  } catch (e) {
    if (/UNIQUE/i.test(String((e as Error).message) + String((e as { cause?: unknown }).cause ?? ''))) return { ok: false, errors: { code: 'هذا الرمز مستخدم' } }
    throw e
  }
  await audit(admin.name, id ? 'update' : 'create', 'coupon', cid, p.data.code, p.data)
  revalidatePath('/admin/coupons', 'layout')
  return { ok: true, id: cid }
}

/** دفعة أكواد فريدة لاستخدام واحد لكل منها — للمؤسسات والمنح */
export async function generateBatch(raw: CouponInput & { count: number; prefix: string }): Promise<{ ok: boolean; codes?: string[]; error?: string }> {
  const admin = await requirePermission('sales.coupons')
  const n = Math.max(1, Math.min(500, Math.floor(raw.count)))
  const prefix = normalizeCode(raw.prefix).slice(0, 12) || 'NAF'
  const batch = `${prefix}-${Date.now().toString(36).toUpperCase()}`
  const p = couponInput.safeParse({ ...raw, code: `${prefix}-XXXX`, maxUses: 1, maxPerLearner: 1 })
  if (!p.success) return { ok: false, error: Object.values(errorsOf(p.error))[0] }
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const codes = new Set<string>()
  while (codes.size < n) {
    const b = randomBytes(6)
    codes.add(`${prefix}-${Array.from(b, (x) => alphabet[x % alphabet.length]).join('')}`)
  }
  const list = [...codes]
  for (const part of chunksOf(s.coupons, list))
    await db.insert(s.coupons).values(part.map((code) => ({ ...p.data, id: randomUUID(), code, batch, label: p.data.label || `دفعة ${batch}` })))
  await audit(admin.name, 'batch', 'coupon', batch, `${n} كوداً ${prefix}`)
  revalidatePath('/admin/coupons', 'layout')
  return { ok: true, codes: list }
}

export async function setCouponActive(id: string, active: boolean) {
  const admin = await requirePermission('sales.coupons')
  if (typeof active !== 'boolean' || !validId(id)) return
  await db.update(s.coupons).set({ active }).where(eq(s.coupons.id, id))
  revalidatePath('/admin/coupons', 'layout')
  await audit(admin.name, active ? 'enable' : 'disable', 'coupon', id, active ? 'تفعيل' : 'إيقاف')
}

export async function trashCoupon(id: string) {
  const admin = await requirePermission('sales.coupons')
  if (!validId(id)) return
  await db.update(s.coupons).set({ deletedAt: new Date().toISOString() }).where(eq(s.coupons.id, id))
  await audit(admin.name, 'trash', 'coupon', id, 'نُقل إلى المحذوفات')
  revalidatePath('/admin/coupons', 'layout')
}

/* ───────── الطلبات ───────── */

export async function refundAction(orderId: string, amountSar: number, reason: string, cancel: boolean) {
  const admin = await requirePermission('sales.refund')
  if (typeof orderId !== 'string' || typeof amountSar !== 'number' || !Number.isFinite(amountSar) || typeof cancel !== 'boolean' || typeof reason !== 'string') return { ok: false, error: 'بيانات غير صالحة' }
  if (!reason.trim()) return { ok: false, error: 'اذكر سبب الاسترداد' }
  const r = await refundOrder(orderId, Math.round(amountSar * 100), reason.trim().slice(0, 300), cancel, admin.name)
  /* إلغاء التسجيلات يحرّر مقاعد — تُحدَّث الصفحات العامة فوراً لا بعد خمس دقائق */
  revalidatePath('/', 'layout')
  return r
}

export async function cancelPending(orderId: string) {
  const admin = await requirePermission('sales.orders')
  if (!validId(orderId)) return
  await db.update(s.orders).set({ status: 'canceled', updatedAt: new Date().toISOString() }).where(and(eq(s.orders.id, orderId), eq(s.orders.status, 'pending')))
  await audit(admin.name, 'cancel', 'order', orderId, 'إلغاء طلب معلّق')
  revalidatePath('/', 'layout')
}

const manualInput = z.object({
  courseSlug: z.string().min(1, 'اختر الدورة'),
  tierId: z.string().nullable(),
  cohortId: z.string().uuid().nullable(),
  quantity: z.number().int().min(1).max(50),
  code: z.string().max(40),
  method: z.enum(['bank_transfer', 'cash', 'grant']),
  note: z.string().max(500),
  attendSelf: z.boolean(),
  buyer: z.object({
    name: z.string().trim().min(2, 'الاسم مطلوب'), email: z.string().trim().email('بريد غير صالح'),
    phone: z.string().trim().max(20), org: z.string().trim().max(160), vatNumber: z.string().trim().max(15),
  }),
})
export type ManualInput = z.input<typeof manualInput>

/** طلب يدوي (تحويل بنكي / نقد / منحة) — يعمل والدفع الإلكتروني مطفأ */
export async function manualOrder(raw: ManualInput): Promise<{ ok: boolean; id?: string; error?: string; fields?: Record<string, string> }> {
  const admin = await requirePermission('sales.orders')
  const p = manualInput.safeParse(raw)
  if (!p.success) return { ok: false, error: 'راجع الحقول', fields: errorsOf(p.error) }
  /* المدرب (إن مُنح الصلاحية) يُحصر في دوراته */
  const scope = await courseScope(admin)
  if (scope) {
    const [c] = await db.select({ id: s.courses.id }).from(s.courses).where(eq(s.courses.slug, p.data.courseSlug))
    if (!c || !inScope(scope, c.id)) return { ok: false, error: 'الدورة خارج دوراتك' }
  }
  const r = await placeOrder({ slug: p.data.courseSlug, tierId: p.data.tierId, cohortId: p.data.cohortId, quantity: p.data.quantity, code: p.data.code || undefined, buyer: p.data.buyer, attendSelf: p.data.attendSelf, method: p.data.method, by: admin.name, note: p.data.note })
  if (!r.ok) return { ok: false, error: r.error }
  revalidatePath('/', 'layout')
  return { ok: true, id: r.order.id }
}

/** تخصيص مقعد من طلب جماعي لبريد مشارك */
export async function assignSeat(grantId: string, email: string, name: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requirePermission('sales.orders')
  if (!validId(grantId) || typeof email !== 'string' || typeof name !== 'string' || email.length > 160 || name.length > 120) return { ok: false, error: 'بيانات غير صالحة' }
  const [g] = await db.select({ courseId: s.seatGrants.courseId }).from(s.seatGrants).where(eq(s.seatGrants.id, grantId))
  if (!g) return { ok: false, error: 'المقعد غير موجود' }
  if (!inScope(await courseScope(admin), g.courseId)) return { ok: false, error: 'الدورة خارج دوراتك' }
  const r = await assignSeatCore(grantId, email, name, admin.name)
  if (r.orderId) revalidatePath(`/admin/orders/${r.orderId}`)
  return { ok: r.ok, error: r.error }
}

/** إلغاء تسجيل أو إضافته يدوياً من صفحة المسجّلين */
export async function setEnrollment(enrollmentId: string, status: 'active' | 'canceled'): Promise<{ ok: boolean; error?: string }> {
  const admin = await requirePermission('sales.orders')
  if ((status !== 'active' && status !== 'canceled') || !z.string().uuid().safeParse(enrollmentId).success) return { ok: false, error: 'حالة غير صالحة' }
  const [en] = await db.select().from(s.enrollments).where(eq(s.enrollments.id, enrollmentId))
  if (!en) return { ok: false, error: 'التسجيل غير موجود' }
  if (!inScope(await courseScope(admin), en.courseId)) return { ok: false, error: 'الدورة خارج دوراتك' }
  if (status === 'canceled') {
    /* مقعد الطلب الجماعي يعود شاغراً فيُخصَّص لغيره */
    await db.update(s.seatGrants).set({ enrollmentId: null, email: null }).where(eq(s.seatGrants.enrollmentId, enrollmentId))
  } else if (en.status !== 'active' && en.contractId) {
    /* مقعد عقد: العقد ساري وفيه متّسع */
    const [c] = await db.select().from(s.orgContracts).where(and(eq(s.orgContracts.id, en.contractId), isNull(s.orgContracts.deletedAt)))
    if (!c || contractState(c) !== 'active') return { ok: false, error: 'عقد هذا المقعد غير ساري — خصّص المقعد من عقد ساري' }
    if ((await contractUsed(c.id)) >= c.seats) return { ok: false, error: 'استُنفدت مقاعد العقد' }
  } else if (en.status !== 'active' && !(en.source === 'seat' && en.orderId)) {
    /* إحياء تسجيل ملغى يأخذ مقعداً: الدفعة أو الدورة فيها متّسع */
    const [course] = await db.select().from(s.courses).where(eq(s.courses.id, en.courseId))
    const [cohort] = en.cohortId ? await db.select().from(s.cohorts).where(eq(s.cohorts.id, en.cohortId)) : []
    const room = course && (await noRoom(course, cohort ?? null, 1))
    if (room) return { ok: false, error: `${room} — لا يمكن إعادة التفعيل` }
  }
  if (status === 'active' && en.source === 'seat' && en.orderId) {
    const [free] = await db.select({ id: s.seatGrants.id }).from(s.seatGrants).where(and(eq(s.seatGrants.orderId, en.orderId), eq(s.seatGrants.courseId, en.courseId), isNull(s.seatGrants.enrollmentId)))
    if (!free) return { ok: false, error: 'لا مقعد شاغر في طلب المؤسسة — خُصّصت مقاعده كلها' }
    const [learner] = await db.select({ email: s.learners.email }).from(s.learners).where(eq(s.learners.id, en.learnerId))
    const got = await db.update(s.seatGrants).set({ enrollmentId, email: learner?.email ?? null }).where(and(eq(s.seatGrants.id, free.id), isNull(s.seatGrants.enrollmentId))).returning({ id: s.seatGrants.id })
    if (!got.length) return { ok: false, error: 'خُصّص المقعد للتو لغيره — أعد المحاولة' }
  }
  try {
    await db.update(s.enrollments).set({ status, updatedAt: new Date().toISOString() }).where(eq(s.enrollments.id, enrollmentId))
  } catch {
    return { ok: false, error: 'للمتدرب تسجيل نشط آخر في الدورة' }
  }
  await audit(admin.name, status === 'active' ? 'restore' : 'cancel', 'enrollment', enrollmentId, status === 'active' ? 'تفعيل تسجيل' : 'إلغاء تسجيل', { before: en.status, status })
  revalidatePath('/', 'layout')
  return { ok: true }
}

/** إعادة إرسال تأكيد الطلب والفاتورة إلى المشتري */
export async function resendOrderEmail(orderId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requirePermission('sales.orders')
  if (typeof orderId !== 'string' || orderId.length > 64) return { ok: false, error: 'طلب غير صالح' }
  const { onOrderPaid } = await import('@/server/notify/engine')
  const r = await onOrderPaid(orderId, { resend: true })
  await audit(admin.name, 'resend', 'order', orderId, 'إعادة إرسال تأكيد الطلب')
  revalidatePath(`/admin/orders/${orderId}`)
  return r.ok ? { ok: true } : { ok: false, error: 'تعذّر الإرسال — راجع قنوات الرسائل وطابور الرسائل' }
}

/* ───────── وافق (الفوترة المحاسبية) ───────── */

const wafeqId = z.string().trim().max(80).regex(/^[\w-]*$/, 'معرّف غير صالح')
const wafeqInput = z.object({
  enabled: z.boolean(),
  reportToTax: z.boolean(),
  revenueAccount: wafeqId,
  discountAccount: wafeqId,
  taxRate: wafeqId,
  paidThrough: z.object({ gateway: wafeqId, bank_transfer: wafeqId, cash: wafeqId }),
  language: z.enum(['ar', 'en']),
})

export async function saveWafeqSettings(raw: WafeqSettings): Promise<Result> {
  const admin = await requirePermission('payments.manage')
  const p = wafeqInput.safeParse(raw)
  if (!p.success) return { ok: false, errors: errorsOf(p.error), message: 'راجع الحقول' }
  if (p.data.enabled) {
    const st = wafeqState(p.data)
    if (!st.active) return { ok: false, errors: { enabled: st.problem ?? 'غير جاهز' }, message: 'لا يمكن التفعيل قبل اكتمال الربط' }
  }
  const before = await wafeqSettings()
  await setSetting('wafeq', p.data)
  await audit(admin.name, before.enabled !== p.data.enabled ? (p.data.enabled ? 'enable' : 'disable') : 'update', 'wafeq', 'settings',
    before.enabled !== p.data.enabled ? (p.data.enabled ? 'تفعيل الربط مع وافق' : 'إيقاف الربط مع وافق') : 'إعدادات وافق', p.data)
  revalidatePath('/admin/settings/payments')
  return { ok: true, id: 'wafeq' }
}

/** اختبار الاتصال وجلب الحسابات ونسب الضريبة لقوائم الإعداد */
export async function wafeqCatalogAction(): Promise<{ ok: true; catalog: WafeqCatalog } | { ok: false; error: string }> {
  await requirePermission('payments.manage')
  if (!wafeqState({ ...(await wafeqSettings()), enabled: true }).keyed) return { ok: false, error: 'أضف WAFEQ_API_KEY في بيئة الخادم أولاً' }
  try {
    return { ok: true, catalog: await wafeqCatalog() }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** إعادة مزامنة فاتورة أو إشعار دائن مع وافق (ما فشل أو صدر قبل الربط) */
export async function resyncWafeq(invoiceId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requirePermission('sales.orders')
  if (typeof invoiceId !== 'string' || invoiceId.length > 64) return { ok: false, error: 'مستند غير صالح' }
  const [inv] = await db.select({ orderId: s.invoices.orderId, number: s.invoices.number }).from(s.invoices).where(eq(s.invoices.id, invoiceId))
  if (!inv) return { ok: false, error: 'المستند غير موجود' }
  if (!wafeqState(await wafeqSettings()).active) return { ok: false, error: 'الربط مع وافق غير مفعّل' }
  const r = await resyncInvoice(invoiceId)
  await audit(admin.name, 'wafeq_resync', 'order', inv.orderId, `إعادة مزامنة ${inv.number} مع وافق`)
  revalidatePath(`/admin/orders/${inv.orderId}`)
  if (r === 'done') return { ok: true }
  const [after] = await db.select({ e: s.invoices.wafeqError }).from(s.invoices).where(eq(s.invoices.id, invoiceId))
  return { ok: false, error: r === 'pending' ? `لم تكتمل — ستُعاد تلقائياً${after?.e ? `: ${after.e}` : ''}` : after?.e || 'تعذّرت المزامنة' }
}
