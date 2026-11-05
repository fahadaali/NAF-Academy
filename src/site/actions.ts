'use server'
/* إجراءات الزائر: التسعير الحي، وإنشاء الطلب، وتسجيل الاهتمام. كل مبلغ يُحسب هنا لا في المتصفح. */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { db, schema as s } from '@/server/db'
import { placeOrder, priceFor } from '@/server/sales'
import { limited } from '@/server/ratelimit'
import { INTEREST_KIND } from '@/server/db/schema'
import type { Quote } from '@/lib/quote'
import { currentLearner } from '@/server/learner-auth'
import { channelOpen } from '@/server/notify/channels'

export type QuoteView = Quote & { couponCode?: string; couponLabel?: string; tierId: string | null }

export async function quoteAction(slug: string, o: { tierId?: string | null; quantity: number; code?: string; email?: string }): Promise<QuoteView | null> {
  if (o.code && (await limited('coupon', 30, 10 * 60e3))) {
    const base = await priceFor(slug, { ...o, code: undefined })
    return base ? { ...base.q, couponError: 'محاولات كثيرة — انتظر قليلاً', tierId: base.tier?.id ?? null } : null
  }
  const p = await priceFor(slug, { tierId: o.tierId, quantity: o.quantity, code: o.code, email: o.email?.trim().toLowerCase() })
  if (!p) return null
  return { ...p.q, couponCode: p.q.couponApplied ? p.coupon!.code : undefined, couponLabel: p.coupon?.label || undefined, tierId: p.tier?.id ?? null }
}

const buyer = z.object({
  name: z.string().trim().min(3, 'الاسم الكامل مطلوب').max(120),
  email: z.string().trim().email('بريد غير صالح').max(160),
  phone: z.string().trim().regex(/^\+?[\d\s-]{9,16}$/, 'رقم جوال غير صالح'),
  org: z.string().trim().max(160),
  vatNumber: z.union([z.literal(''), z.string().trim().regex(/^3\d{13}3$/, 'الرقم الضريبي 15 رقماً يبدأ وينتهي بـ 3')]),
})

const orderInput = z.object({
  tierId: z.string().nullable(),
  quantity: z.number().int().min(1).max(50),
  code: z.string().max(40),
  attendSelf: z.boolean(),
  agree: z.literal(true, { message: 'يلزم الموافقة على الشروط' }),
  buyer,
})

export type PlaceResponse = { ok: true; url: string } | { ok: false; error: string; fields?: Record<string, string> }

export async function placeOrderAction(slug: string, raw: unknown): Promise<PlaceResponse> {
  if (await limited('order', 12, 10 * 60e3)) return { ok: false, error: 'محاولات كثيرة — حاول بعد دقائق' }
  const p = orderInput.safeParse(raw)
  if (!p.success) {
    const fields: Record<string, string> = {}
    for (const i of p.error.issues) fields[i.path.join('.')] ??= i.message
    return { ok: false, error: 'راجع البيانات المعلّمة', fields }
  }
  /* متى فُتح الدخول صار التحقق من البريد شرطاً — والبريد بريد الحساب لا ما يكتبه المتصفح */
  const me = await currentLearner()
  const verify = (await channelOpen('email')) || (await channelOpen('sms'))
  if (verify && !me) return { ok: false, error: 'تحقّق من بريدك أولاً' }
  const buyer = me ? { ...p.data.buyer, email: me.email } : p.data.buyer
  const r = await placeOrder({ slug, tierId: p.data.tierId, quantity: p.data.quantity, code: p.data.code || undefined, buyer, attendSelf: p.data.attendSelf })
  if (!r.ok) return { ok: false, error: r.error }
  const q = `t=${r.order.token}`
  return { ok: true, url: r.free ? `/orders/${r.order.number}?${q}` : `/orders/${r.order.number}/pay?${q}` }
}

const interestInput = z.object({
  kind: z.enum(INTEREST_KIND),
  name: z.string().trim().max(120),
  email: z.string().trim().email('بريد غير صالح').max(160),
  phone: z.string().trim().max(20),
})

export async function interestAction(slug: string, raw: unknown): Promise<{ ok: boolean; error?: string }> {
  if (await limited('interest', 10, 10 * 60e3)) return { ok: false, error: 'محاولات كثيرة — حاول بعد دقائق' }
  const p = interestInput.safeParse(raw)
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message }
  const { eq, and, isNull } = await import('drizzle-orm')
  const [course] = await db.select({ id: s.courses.id }).from(s.courses).where(and(eq(s.courses.slug, slug), isNull(s.courses.deletedAt)))
  if (!course) return { ok: false, error: 'الدورة غير موجودة' }
  const email = p.data.email.toLowerCase()
  const [dup] = await db.select({ id: s.interest.id }).from(s.interest).where(and(eq(s.interest.courseId, course.id), eq(s.interest.email, email), eq(s.interest.kind, p.data.kind)))
  if (!dup) await db.insert(s.interest).values({ id: randomUUID(), courseId: course.id, ...p.data, email })
  return { ok: true }
}
