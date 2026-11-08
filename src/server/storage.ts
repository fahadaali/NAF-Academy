import 'server-only'
/* تخزين الوسائط — R2 داخل Cloudflare (ارتباط MEDIA)، وملفات محلية في .data/media أثناء التطوير. */
import { cfEnv } from './runtime'

const ROOT = () => `${process.cwd()}/.data/media`

async function fsSafe(key: string) {
  const { join, normalize } = await import('node:path')
  const root = ROOT()
  const p = normalize(join(root, key))
  if (!p.startsWith(root + '/')) throw new Error('bad key')
  return p
}

const keyOk = (key: string) => /^[\w.-]{1,128}$/.test(key)

export async function putObject(key: string, bytes: Uint8Array, type?: string) {
  if (!keyOk(key)) throw new Error('bad key')
  const r2 = cfEnv()?.MEDIA
  if (r2) { await r2.put(key, bytes, { httpMetadata: { contentType: type } }); return }
  const { mkdir, writeFile } = await import('node:fs/promises')
  await mkdir(ROOT(), { recursive: true })
  await writeFile(await fsSafe(key), bytes)
}

export async function getObject(key: string): Promise<Uint8Array | null> {
  if (!keyOk(key)) return null
  const r2 = cfEnv()?.MEDIA
  if (r2) {
    const o = await r2.get(key)
    return o ? new Uint8Array(await o.arrayBuffer()) : null
  }
  try {
    const { readFile } = await import('node:fs/promises')
    return new Uint8Array(await readFile(await fsSafe(key)))
  } catch {
    return null
  }
}

/** جسم الملف تدفّقاً (لا يُحمَّل كاملاً في الذاكرة) مع حجمه ووسمه إن عُرفا — لتقديم الوسائط */
export type ObjectStream = { body: ReadableStream<Uint8Array>; size?: number; etag?: string }

type R2Body = { body: ReadableStream<Uint8Array>; size?: number; httpEtag?: string }

export async function getObjectStream(key: string): Promise<ObjectStream | null> {
  if (!keyOk(key)) return null
  const r2 = cfEnv()?.MEDIA
  if (r2) {
    const o = (await r2.get(key)) as unknown as R2Body | null
    return o ? { body: o.body, size: o.size, etag: o.httpEtag } : null
  }
  try {
    const [{ stat }, { createReadStream }, { Readable }] = await Promise.all([import('node:fs/promises'), import('node:fs'), import('node:stream')])
    const p = await fsSafe(key)
    const st = await stat(p)
    if (!st.isFile()) return null
    const body = Readable.toWeb(createReadStream(p)) as unknown as ReadableStream<Uint8Array>
    return { body, size: st.size, etag: `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"` }
  } catch {
    return null
  }
}

export async function deleteObject(key: string) {
  if (!keyOk(key)) return
  const r2 = cfEnv()?.MEDIA
  if (r2) { await r2.delete(key); return }
  const { unlink } = await import('node:fs/promises')
  await unlink(await fsSafe(key)).catch(() => {})
}
