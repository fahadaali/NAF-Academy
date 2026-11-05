/* /favicon.ico — أيقونة اللوحة إن رُفعت، وإلا الافتراضية */
import { brandView } from '@/server/brand'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const b = await brandView()
  return Response.redirect(new URL(b.icon?.url ?? '/icons/favicon.ico', req.url), 302)
}
