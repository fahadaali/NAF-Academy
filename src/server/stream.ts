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

/* ───────── الترجمات النصية في Stream ───────── */
export type StreamCaption = { language: string; label: string; generated?: boolean; status?: string }

export async function streamCaptions(uid: string): Promise<StreamCaption[] | null> {
  if (!streamState().configured || !/^[a-f0-9]{32}$/.test(uid)) return null
  const r = await fetch(`${api()}/${uid}/captions`, { headers: auth() })
  if (!r.ok) return null
  return (((await r.json()) as { result?: StreamCaption[] }).result ?? [])
}

/** رفع ملف VTT للغة — يحلّ محل ترجمة اللغة نفسها إن وُجدت */
export async function streamCaptionUpload(uid: string, lang: string, vtt: string): Promise<boolean> {
  if (!streamState().configured || !/^[a-f0-9]{32}$/.test(uid) || !/^[a-z]{2}(-[A-Z]{2})?$/.test(lang)) return false
  const fd = new FormData()
  fd.append('file', new Blob([vtt], { type: 'text/vtt' }), `${lang}.vtt`)
  const r = await fetch(`${api()}/${uid}/captions/${lang}`, { method: 'PUT', headers: { authorization: auth().authorization }, body: fd })
  return r.ok
}

/** توليد ترجمة آلياً من صوت الفيديو (ميزة Stream) */
export async function streamCaptionGenerate(uid: string, lang: string): Promise<boolean> {
  if (!streamState().configured || !/^[a-f0-9]{32}$/.test(uid) || !/^[a-z]{2}$/.test(lang)) return false
  const r = await fetch(`${api()}/${uid}/captions/${lang}/generate`, { method: 'POST', headers: auth() })
  return r.ok
}

/** نسخ ملف من رابط إلى Stream (تسجيلات Zoom) — يعيد معرّف الفيديو */
export async function streamCopy(url: string, name: string): Promise<string | null> {
  if (!streamState().configured || !/^https:\/\//.test(url)) return null
  const r = await fetch(`${api()}/copy`, { method: 'POST', headers: auth(), body: JSON.stringify({ url, meta: { name }, requireSignedURLs: true }) })
  if (!r.ok) return null
  return ((await r.json()) as { result?: { uid?: string } }).result?.uid ?? null
}
