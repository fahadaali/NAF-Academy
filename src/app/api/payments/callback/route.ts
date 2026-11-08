/* عودة المتصفح من نموذج الدفع: ميسر يضيف ?id=&status=&message= — لا نثق بها، نتحقق من البوابة نفسها.
   رابط العودة يحمل رمز الطلب (t) كصفحة الطلب نفسها: معرّف الطلب وحده لا يفتح صفحته ولا يكشف رمزها.
   بلا رمز صحيح تُؤكَّد الدفعة من البوابة كالمعتاد (الـWebhook يفعل الشيء نفسه)، ثم يُحوَّل المشتري إلى «طلباتي» بعد الدخول. */
import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema as s } from '@/server/db'
import { confirmPayment } from '@/server/sales'

export const dynamic = 'force-dynamic'

const sameToken = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const orderId = url.searchParams.get('order') ?? ''
  const token = url.searchParams.get('t') ?? ''
  const paymentId = (url.searchParams.get('id') ?? '').slice(0, 120)
  const [order] = z.string().uuid().safeParse(orderId).success ? await db.select().from(s.orders).where(eq(s.orders.id, orderId)) : []
  if (!order) return NextResponse.redirect(new URL('/courses', url), 303)
  const trusted = !!token && sameToken(token, order.token)
  let failed = ''
  if (paymentId) {
    try {
      const r = await confirmPayment(paymentId, order.id)
      if (r.outcome === 'failed') failed = url.searchParams.get('message')?.slice(0, 140) || '1'
    } catch {
      failed = 'تعذّر التحقق من الدفعة'
    }
  }
  if (!trusted) return NextResponse.redirect(new URL('/learn/orders', url), 303)
  const back = new URL(`/orders/${order.number}`, url)
  back.searchParams.set('t', order.token)
  if (failed) back.searchParams.set('failed', failed)
  return NextResponse.redirect(back, 303)
}
