import 'server-only'
/* بيئة Cloudflare إن كنا داخلها (D1 / R2 / KV والأسرار)، وإلا null فنعمل محلياً. */
import { getCloudflareContext } from '@opennextjs/cloudflare'

export type CfEnv = {
  DB?: unknown
  MEDIA?: { put(k: string, v: Uint8Array, o?: unknown): Promise<unknown>; get(k: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>; delete(k: string): Promise<void> }
  AUTH_KV?: unknown
  [k: string]: unknown
}

export function cfEnv(): CfEnv | null {
  try {
    return getCloudflareContext().env as CfEnv
  } catch {
    return null
  }
}

/** قراءة متغيّر بيئة من Cloudflare أولاً ثم process.env */
export function envVar(name: string): string | undefined {
  const v = cfEnv()?.[name]
  return typeof v === 'string' ? v : process.env[name]
}
