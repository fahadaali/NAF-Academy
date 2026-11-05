import { handleLogout } from 'naf-auth'
import { cfEnv } from '@/server/runtime'
import { ssoConfig } from '@/server/sso'

export async function POST(req: Request) {
  const env = cfEnv()
  if (!env) return Response.redirect(new URL('/admin/login', req.url), 303)
  return handleLogout(req, env, ssoConfig(env))
}
