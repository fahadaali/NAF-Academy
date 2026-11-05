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

export async function deleteObject(key: string) {
  if (!keyOk(key)) return
  const r2 = cfEnv()?.MEDIA
  if (r2) { await r2.delete(key); return }
  const { unlink } = await import('node:fs/promises')
  await unlink(await fsSafe(key)).catch(() => {})
}
