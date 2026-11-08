/* تنزيل الفاتورة PDF — برمز وصول الطلب نفسه. فاتورة وافق متى رُبط واكتملت مزامنتها، وإلا المحلية (تُخزَّن بعد أول توليد) */
import { orderForBuyer } from '@/server/sales'
import { officialFile } from '@/server/invoices'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, ctx: { params: Promise<{ number: string; inv: string }> }) {
  const { number, inv } = await ctx.params
  const t = new URL(req.url).searchParams.get('t') ?? ''
  const o = await orderForBuyer(number, t)
  const invoice = o?.invoices.find((i) => i.number === inv)
  if (!o || !invoice) return new Response('Not found', { status: 404 })
  const { bytes } = await officialFile(invoice, { orderNumber: number, vatRate: o.order.vatRate })
  return new Response(bytes as BodyInit, {
    headers: { 'content-type': 'application/pdf', 'cache-control': 'private, no-store', 'content-disposition': `attachment; filename="${invoice.number}.pdf"` },
  })
}
