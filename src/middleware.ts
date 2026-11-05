/* الوسيط: يحرس /admin بالدخول الموحّد لناف (naf-auth) متى ضُبط STAFF_AUTH=naf-auth.
   وفي كل حال يمسح ترويسات الهوية الواردة من المتصفح كي لا تُنتحل. */
import { NextResponse, type NextRequest } from 'next/server'

const H = ['x-naf-sub', 'x-naf-role', 'x-naf-perms']

function clean(req: NextRequest) {
  const h = new Headers(req.headers)
  for (const k of H) h.delete(k)
  return h
}

export async function middleware(req: NextRequest) {
  /* OpenNext ينسخ متغيّرات Cloudflare إلى process.env — فلا نستورد شيئاً من Cloudflare محلياً */
  if (process.env.STAFF_AUTH !== 'naf-auth') return NextResponse.next({ request: { headers: clean(req) } })
  const { getCloudflareContext } = await import('@opennextjs/cloudflare')
  let env: Record<string, unknown> | null = null
  try { env = (await getCloudflareContext({ async: true })).env as Record<string, unknown> } catch {}
  const mode = (env?.STAFF_AUTH ?? process.env.STAFF_AUTH) === 'naf-auth' && env ? 'naf-auth' : 'password'
  if (mode !== 'naf-auth') return NextResponse.next({ request: { headers: clean(req) } })

  const issuer = String(env?.AUTH_ISSUER ?? '')
  if (!/^https:\/\/[\w.-]+/.test(issuer) || !env?.PLATFORM_ID)
    return new NextResponse('الدخول الموحّد غير مضبوط: AUTH_ISSUER و PLATFORM_ID مطلوبان في إعدادات النشر.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  const { authenticate } = await import('naf-auth')
  const { ssoConfig } = await import('./server/sso')
  const config = ssoConfig(env!)
  const result = await authenticate(req, env, config)
  if (result.response) return new NextResponse(result.response.body, { status: result.response.status, headers: result.response.headers })
  const headers = clean(req)
  if (result.user) {
    headers.set('x-naf-sub', result.user.id)
    headers.set('x-naf-role', result.user.role)
    if (result.user.perms) headers.set('x-naf-perms', JSON.stringify(result.user.perms))
  }
  return NextResponse.next({ request: { headers } })
}

export const config = { matcher: ['/admin/:path*', '/admin', '/auth/:path*', '/denied'] }
