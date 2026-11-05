import { handleCallback } from 'naf-auth'
import { cfEnv } from '@/server/runtime'
import { ssoConfig } from '@/server/sso'

export async function GET(req: Request) {
  const env = cfEnv()
  if (!env) return new Response('الدخول الموحّد يعمل على Cloudflare فقط', { status: 501 })
  return handleCallback(req, env, ssoConfig(env))
}
