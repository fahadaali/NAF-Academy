/* عودة المتصفح من نموذج الدفع: ميسر يضيف ?id=&status=&message= — لا نثق بها، نتحقق من البوابة نفسها. */
import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { confirmPayment } from '@/server/sales'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const orderId = url.searchParams.get('order') ?? ''
  const paymentId = url.searchParams.get('id') ?? ''
  const [order] = await db.select().from(s.orders).where(eq(s.orders.id, orderId))
  if (!order) return NextResponse.redirect(new URL('/courses', url), 303)
  const back = new URL(`/orders/${order.number}`, url)
  back.searchParams.set('t', order.token)
  if (!paymentId) return NextResponse.redirect(back, 303)
  try {
    const r = await confirmPayment(paymentId, order.id)
    if (r.outcome === 'failed') back.searchParams.set('failed', url.searchParams.get('message')?.slice(0, 140) || '1')
  } catch {
    back.searchParams.set('failed', 'تعذّر التحقق من الدفعة')
  }
  return NextResponse.redirect(back, 303)
}
