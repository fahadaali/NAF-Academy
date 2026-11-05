'use server'
/* إجراءات المبيعات في اللوحة — الإعدادات، والكوبونات، والاسترداد، والطلب اليدوي، وتخصيص المقاعد. */
import { randomBytes, randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema as s } from '@/server/db'
import { requireAdmin } from '@/server/auth'
import { audit } from '@/server/audit'
import { gatewayStatus } from '@/server/payments/gateway'
import { paymentSettings, setSetting, type PaymentSettings } from '@/server/settings'
import { placeOrder, refundOrder, upsertLearner } from '@/server/sales'
import { normalizeCode } from '@/lib/quote'
import { COUPON_KIND, COUPON_SCOPE } from '@/server/db/schema'
import { errorsOf, type Result } from '@/admin/schemas'

const iso = z.string().datetime({ offset: true }).nullable()

/* ───────── إعدادات الدفع ───────── */

const settingsInput = z.object({
  enabled: z.boolean(),
  methods: z.array(z.enum(['creditcard', 'applepay', 'stcpay'])).min(1, 'اختر وسيلة واحدة على الأقل'),
  holdMinutes: z.number().int().min(10).max(120),
  vatRate: z.number().min(0).max(30),
  seller: z.object({
    name: z.string().trim().min(3).max(200),
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
  const admin = await requireAdmin()
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
  const admin = await requireAdmin()
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
  return { ok: true, id: cid }
}

/** دفعة أكواد فريدة لاستخدام واحد لكل منها — للمؤسسات والمنح */
export async function generateBatch(raw: CouponInput & { count: number; prefix: string }): Promise<{ ok: boolean; codes?: string[]; error?: string }> {
  const admin = await requireAdmin()
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
  for (let i = 0; i < list.length; i += 50)
    await db.insert(s.coupons).values(list.slice(i, i + 50).map((code) => ({ ...p.data, id: randomUUID(), code, batch, label: p.data.label || `دفعة ${batch}` })))
  await audit(admin.name, 'batch', 'coupon', batch, `${n} كوداً ${prefix}`)
  return { ok: true, codes: list }
}

export async function setCouponActive(id: string, active: boolean) {
  const admin = await requireAdmin()
  await db.update(s.coupons).set({ active }).where(eq(s.coupons.id, id))
  await audit(admin.name, active ? 'enable' : 'disable', 'coupon', id, active ? 'تفعيل' : 'إيقاف')
}

export async function trashCoupon(id: string) {
  const admin = await requireAdmin()
  await db.update(s.coupons).set({ deletedAt: new Date().toISOString(), active: false }).where(eq(s.coupons.id, id))
  await audit(admin.name, 'trash', 'coupon', id, 'نُقل إلى المحذوفات')
}

/* ───────── الطلبات ───────── */

export async function refundAction(orderId: string, amountSar: number, reason: string, cancel: boolean) {
  const admin = await requireAdmin()
  if (!reason.trim()) return { ok: false, error: 'اذكر سبب الاسترداد' }
  const r = await refundOrder(orderId, Math.round(amountSar * 100), reason.trim().slice(0, 300), cancel, admin.name)
  revalidatePath(`/admin/orders/${orderId}`)
  return r
}

export async function cancelPending(orderId: string) {
  const admin = await requireAdmin()
  await db.update(s.orders).set({ status: 'canceled', updatedAt: new Date().toISOString() }).where(and(eq(s.orders.id, orderId), eq(s.orders.status, 'pending')))
  await audit(admin.name, 'cancel', 'order', orderId, 'إلغاء طلب معلّق')
  revalidatePath(`/admin/orders/${orderId}`)
}

const manualInput = z.object({
  courseSlug: z.string().min(1, 'اختر الدورة'),
  tierId: z.string().nullable(),
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
  const admin = await requireAdmin()
  const p = manualInput.safeParse(raw)
  if (!p.success) return { ok: false, error: 'راجع الحقول', fields: errorsOf(p.error) }
  const r = await placeOrder({ slug: p.data.courseSlug, tierId: p.data.tierId, quantity: p.data.quantity, code: p.data.code || undefined, buyer: p.data.buyer, attendSelf: p.data.attendSelf, method: p.data.method, by: admin.name, note: p.data.note })
  if (!r.ok) return { ok: false, error: r.error }
  revalidatePath('/', 'layout')
  return { ok: true, id: r.order.id }
}

/** تخصيص مقعد من طلب جماعي لبريد مشارك */
export async function assignSeat(grantId: string, email: string, name: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin()
  const e = z.string().trim().email().safeParse(email)
  if (!e.success) return { ok: false, error: 'بريد غير صالح' }
  const [g] = await db.select().from(s.seatGrants).where(and(eq(s.seatGrants.id, grantId), isNull(s.seatGrants.enrollmentId)))
  if (!g) return { ok: false, error: 'المقعد مخصّص من قبل' }
  const learner = await upsertLearner({ name: name.trim() || e.data.split('@')[0], email: e.data, phone: '', org: '', vatNumber: '' })
  const [dup] = await db.select().from(s.enrollments).where(and(eq(s.enrollments.learnerId, learner.id), eq(s.enrollments.courseId, g.courseId), eq(s.enrollments.status, 'active')))
  if (dup) return { ok: false, error: 'هذا المشارك مسجّل في الدورة من قبل' }
  const [item] = await db.select().from(s.orderItems).where(and(eq(s.orderItems.orderId, g.orderId), eq(s.orderItems.courseId, g.courseId)))
  const eid = randomUUID()
  await db.insert(s.enrollments).values({ id: eid, learnerId: learner.id, courseId: g.courseId, tierId: item?.tierId ?? null, orderId: g.orderId, source: 'seat' })
  await db.update(s.seatGrants).set({ email: learner.email, enrollmentId: eid }).where(eq(s.seatGrants.id, grantId))
  await audit(admin.name, 'assign', 'order', g.orderId, `مقعد ← ${learner.email}`)
  revalidatePath(`/admin/orders/${g.orderId}`)
  return { ok: true }
}

/** إلغاء تسجيل أو إضافته يدوياً من صفحة المسجّلين */
export async function setEnrollment(enrollmentId: string, status: 'active' | 'canceled') {
  const admin = await requireAdmin()
  await db.update(s.enrollments).set({ status, updatedAt: new Date().toISOString() }).where(eq(s.enrollments.id, enrollmentId))
  await audit(admin.name, status === 'active' ? 'restore' : 'cancel', 'enrollment', enrollmentId, status === 'active' ? 'تفعيل تسجيل' : 'إلغاء تسجيل')
  revalidatePath('/', 'layout')
}
