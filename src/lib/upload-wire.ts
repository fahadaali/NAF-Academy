/* نقل الملفات في إجراءات الخادم مرمَّزةً نصاً (base64) لا بايتات خاماً.
   جدار Cloudflare يفحص أجسام طلبات إجراءات الخادم (ترويسة Next-Action — قواعد حماية React Server Components)،
   وبيانات الصور المضغوطة داخل PDF أو صورة قد تطابق أنماطه صدفةً فيُحجب الطلب بـ 403 قبل أن يبلغ العامل.
   النص المرمَّز حروفه [A-Za-z0-9+/=] وحدها فلا يطابقها. الاسم والنوع مرمَّزان كذلك، والفاصل نقطة (ليست من حروف base64).
   الصيغة: naf64.<اسم>.<نوع>.<بيانات> — والخادم يقبل الملف الخام أيضاً (الاختبارات والعملاء القدامى). */

const PREFIX = 'naf64.'
const CHUNK = 0x8000

function bytesToB64(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i += CHUNK) s += String.fromCharCode.apply(null, b.subarray(i, i + CHUNK) as unknown as number[])
  return btoa(s)
}

function b64ToBytes(s: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(s, 'base64'))
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const text = (s: string) => bytesToB64(new TextEncoder().encode(s))
const untext = (s: string) => new TextDecoder().decode(b64ToBytes(s))

/** ملف ← نص مرمَّز */
export async function encodeFile(f: Blob & { name?: string }): Promise<string> {
  return `${PREFIX}${text(f.name ?? 'file')}.${text(f.type || 'application/octet-stream')}.${bytesToB64(new Uint8Array(await f.arrayBuffer()))}`
}

/** نسخة من النموذج كل ملف فيها نص مرمَّز — تُمرَّر إلى إجراء الخادم بدل الأصل */
export async function packForm(fd: FormData): Promise<FormData> {
  const out = new FormData()
  for (const [k, v] of fd.entries()) {
    if (typeof v !== 'string' && v.size === 0 && !v.name) continue
    out.append(k, typeof v === 'string' ? v : await encodeFile(v))
  }
  return out
}

/** قيمة حقل ← ملف: الملف الخام كما هو، والنص المرمَّز يُفكّ، وغيرهما null */
export function decodeUpload(v: FormDataEntryValue | null | undefined): File | null {
  if (v == null) return null
  if (typeof v !== 'string') return v
  if (!v.startsWith(PREFIX)) return null
  const [name, type, data] = v.slice(PREFIX.length).split('.')
  if (name === undefined || type === undefined || data === undefined) return null
  try {
    return new File([b64ToBytes(data) as BlobPart], untext(name), { type: untext(type) })
  } catch {
    return null
  }
}

/** ملف الحقل في نموذج إجراء الخادم */
export const fileOf = (form: FormData, key = 'file') => decodeUpload(form.get(key))
