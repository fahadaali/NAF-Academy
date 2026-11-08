/* رفع الفيديو إلى Stream من المتصفح — بلا مكتبات: طلب مباشر بشريط تقدّم (حتى نحو 200MB)، وما فوقه بأجزاء tus تستأنف عند الانقطاع.
   رابط الرفع وحده يصل المتصفح (من إجراء الخادم) — لا مفتاح ولا رقم حساب. */

/** أجزاء tus عند Stream: بين 5MiB و200MiB، ومن مضاعفات 256KiB، وثابتة طوال الرفع */
export const TUS_CHUNK = 50 * 1024 * 1024
/** الحد الذي فوقه يُرفع الملف بـ tus بدل الطلب المباشر (حد Stream للرفع الأساسي 200MB) */
export const BASIC_MAX = 190 * 1024 * 1024
export function tusChunks(size: number, chunk = TUS_CHUNK): [number, number][] {
  if (chunk % (256 * 1024) !== 0 || chunk < 5 * 1024 * 1024 || chunk > 200 * 1024 * 1024) throw new Error('bad chunk size')
  const out: [number, number][] = []
  for (let a = 0; a < size; a += chunk) out.push([a, Math.min(size, a + chunk)])
  return out
}

export type Progress = { sent: number; total: number }

/** رفع مباشر (FormData) بقراءة التقدّم — fetch لا يعطي تقدّم الرفع، فـ XMLHttpRequest */
export function basicUpload(url: string, file: File, onProgress: (p: Progress) => void, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest()
    x.open('POST', url)
    x.upload.onprogress = (e) => onProgress({ sent: e.loaded, total: e.total || file.size })
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error(`HTTP ${x.status}`)))
    x.onerror = () => reject(new Error('network'))
    x.onabort = () => reject(new DOMException('aborted', 'AbortError'))
    signal.addEventListener('abort', () => x.abort(), { once: true })
    const fd = new FormData()
    fd.append('file', file)
    x.send(fd)
  })
}

/** جزء tus واحد بـ PATCH — يعيد الإزاحة الجديدة */
function patch(url: string, blob: Blob, offset: number, onProgress: (sent: number) => void, signal: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest()
    x.open('PATCH', url)
    x.setRequestHeader('Tus-Resumable', '1.0.0')
    x.setRequestHeader('Upload-Offset', String(offset))
    x.setRequestHeader('Content-Type', 'application/offset+octet-stream')
    x.upload.onprogress = (e) => onProgress(e.loaded)
    x.onload = () => (x.status === 204 || x.status === 200 ? resolve(Number(x.getResponseHeader('Upload-Offset') ?? offset + blob.size)) : reject(new Error(`HTTP ${x.status}`)))
    x.onerror = () => reject(new Error('network'))
    x.onabort = () => reject(new DOMException('aborted', 'AbortError'))
    signal.addEventListener('abort', () => x.abort(), { once: true })
    x.send(blob)
  })
}

/** الإزاحة المحفوظة عند الخادم (HEAD) — للاستئناف بعد انقطاع */
async function serverOffset(url: string, signal: AbortSignal): Promise<number | null> {
  try {
    const r = await fetch(url, { method: 'HEAD', headers: { 'Tus-Resumable': '1.0.0' }, signal })
    const o = Number(r.headers.get('Upload-Offset'))
    return r.ok && Number.isFinite(o) ? o : null
  } catch { return null }
}

/** رفع tus كامل: أجزاء ثابتة، وكل جزء يُعاد حتى 4 مرات بعد سؤال الخادم عن الإزاحة */
export async function tusUpload(url: string, file: File, onProgress: (p: Progress) => void, signal: AbortSignal, retryWait: (n: number) => Promise<void>): Promise<void> {
  let offset = 0
  while (offset < file.size) {
    const end = Math.min(file.size, offset + TUS_CHUNK)
    let tries = 0
    for (;;) {
      try {
        const at = offset
        offset = await patch(url, file.slice(at, end), at, (s) => onProgress({ sent: at + s, total: file.size }), signal)
        break
      } catch (e) {
        if ((e as Error).name === 'AbortError' || ++tries > 4) throw e
        await retryWait(tries)
        offset = (await serverOffset(url, signal)) ?? offset
        if (offset >= end) break
      }
    }
  }
  onProgress({ sent: file.size, total: file.size })
}
