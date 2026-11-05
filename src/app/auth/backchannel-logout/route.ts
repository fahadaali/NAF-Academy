import { handleBackchannelLogout } from 'naf-auth'
import { cfEnv } from '@/server/runtime'
import { ssoConfig } from '@/server/sso'

export async function POST(req: Request) {
  const env = cfEnv()
  if (!env) return new Response('not available', { status: 501 })
  return handleBackchannelLogout(req, env, ssoConfig(env))
}
