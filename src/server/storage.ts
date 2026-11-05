import 'server-only'
/* تخزين الوسائط — ملفات محلية في .data/media أثناء التطوير، وR2 في النشر (الواجهة نفسها). */
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join, normalize } from 'node:path'

const ROOT = join(process.cwd(), '.data', 'media')

const safe = (key: string) => {
  const p = normalize(join(ROOT, key))
  if (!p.startsWith(ROOT + '/')) throw new Error('bad key')
  return p
}

export async function putObject(key: string, bytes: Uint8Array) {
  await mkdir(ROOT, { recursive: true })
  await writeFile(safe(key), bytes)
}

export async function getObject(key: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFile(safe(key)))
  } catch {
    return null
  }
}

export async function deleteObject(key: string) {
  await unlink(safe(key)).catch(() => {})
}
