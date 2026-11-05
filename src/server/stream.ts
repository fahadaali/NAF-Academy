import 'server-only'
/* Cloudflare Stream — تشغيل برموز موقّعة، ورفع مباشر من المتصفح. مقفل حتى تُضاف مفاتيحه.
   البديل حتى الربط: رابط فيديو https مباشر (MP4/HLS) يُشغَّل في المشغّل نفسه. */
import { envVar } from './runtime'

const api = () => `https://api.cloudflare.com/client/v4/accounts/${envVar('CF_ACCOUNT_ID')}/stream`
const auth = () => ({ authorization: `Bearer ${envVar('CF_STREAM_TOKEN')}`, 'content-type': 'application/json' })

export function streamState() {
  const ok = !!(envVar('CF_ACCOUNT_ID') && envVar('CF_STREAM_TOKEN') && envVar('CF_STREAM_CUSTOMER'))
  return ok ? { configured: true as const } : { configured: false as const, problem: 'مفاتيح Cloudflare Stream غير مضافة (CF_ACCOUNT_ID, CF_STREAM_TOKEN, CF_STREAM_CUSTOMER)' }
}

/** رمز تشغيل صالح ساعتين لمعرّف فيديو — الرابط لا يُعاد استعماله خارج المنصة */
export async function playbackUrl(uid: string, startSec = 0): Promise<string | null> {
  if (!streamState().configured || !/^[a-f0-9]{32}$/.test(uid)) return null
  const r = await fetch(`${api()}/${uid}/token`, { method: 'POST', headers: auth(), body: JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 7200 }) })
  if (!r.ok) return null
  const token = ((await r.json()) as { result?: { token?: string } }).result?.token
  return token ? `https://customer-${envVar('CF_STREAM_CUSTOMER')}.cloudflarestream.com/${token}/iframe?startTime=${Math.max(0, Math.floor(startSec))}s&preload=metadata&letterboxColor=transparent` : null
}

/** رابط رفع مباشر (المتصفح يرفع إلى Stream ولا يمرّ الملف بخادمنا) */
export async function directUpload(): Promise<{ uploadURL: string; uid: string } | null> {
  if (!streamState().configured) return null
  const r = await fetch(`${api()}/direct_upload`, { method: 'POST', headers: auth(), body: JSON.stringify({ maxDurationSeconds: 6 * 3600, requireSignedURLs: true }) })
  if (!r.ok) return null
  const j = (await r.json()) as { result?: { uploadURL: string; uid: string } }
  return j.result ?? null
}
