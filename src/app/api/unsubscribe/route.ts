/* إلغاء الاشتراك بنقرة واحدة من عميل البريد (RFC 8058) — POST بلا واجهة، وGET يحوّل لصفحة التأكيد */
import { optoutToken, readOptout, setOptout } from '@/server/notify/optout'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const t = new URL(req.url).searchParams.get('t') ?? ''
  const email = readOptout(t)
  if (!email) return new Response('Invalid', { status: 400 })
  await setOptout(email, true)
  return new Response('OK')
}

export async function GET(req: Request) {
  const u = new URL(req.url)
  const email = readOptout(u.searchParams.get('t') ?? '')
  return Response.redirect(new URL(email ? `/unsubscribe?t=${optoutToken(email)}` : '/', u), 303)
}
