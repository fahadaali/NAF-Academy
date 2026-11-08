import 'server-only'
/* Cloudflare Stream — تشغيل برموز موقّعة، ورفع مباشر من المتصفح (طلب واحد أو tus للملفات الكبيرة). مقفل حتى تُضاف مفاتيحه.
   الأسرار: CF_ACCOUNT_ID، وCF_STREAM_API_TOKEN (أو الاسم القديم CF_STREAM_TOKEN)، وCF_STREAM_CUSTOMER_CODE (أو CF_STREAM_CUSTOMER) —
   تُقرأ داخل الخادم وحده ولا تصل المتصفح ولا السجلات. كل فيديو يُرفع بـ requireSignedURLs ونطاقات مسموحة، والتنزيل لا يُفعَّل.
   البديل حتى الربط: رابط فيديو https مباشر (MP4/HLS) يُشغَّل في المشغّل نفسه. */
import { envVar } from './runtime'
import { siteUrl } from './site'
import { fromStream, tusMetadata, STREAM_UID, type StreamInfo, type StreamVideo } from '@/lib/stream-status'

const accountId = () => envVar('CF_ACCOUNT_ID') ?? ''
const apiToken = () => envVar('CF_STREAM_API_TOKEN') ?? envVar('CF_STREAM_TOKEN') ?? ''
const customerCode = () => {
  const v = (envVar('CF_STREAM_CUSTOMER_CODE') ?? envVar('CF_STREAM_CUSTOMER') ?? '').trim().replace(/^customer-/, '').replace(/\.cloudflarestream\.com.*$/, '')
  return /^[a-z0-9]+$/i.test(v) ? v : ''
}
/** محاكاة Stream لاختبارات المتصفح وحدها (src/app/api/dev/stream) — ممنوعة في الإنتاج */
export const streamMock = () => process.env.STREAM_MOCK === '1' && process.env.NODE_ENV !== 'production'

const api = () => (streamMock() ? `${siteUrl()}/api/dev/stream` : `https://api.cloudflare.com/client/v4/accounts/${accountId()}/stream`)
const auth = () => ({ authorization: `Bearer ${streamMock() ? 'mock' : apiToken()}`, 'content-type': 'application/json' })
const customerHost = () => `https://customer-${streamMock() ? 'mock' : customerCode()}.cloudflarestream.com`

export function streamState() {
  if (streamMock()) return { configured: true as const }
  const ok = !!(accountId() && apiToken() && customerCode())
  return ok ? { configured: true as const } : { configured: false as const, problem: 'مفاتيح Cloudflare Stream غير مضافة (CF_ACCOUNT_ID, CF_STREAM_API_TOKEN, CF_STREAM_CUSTOMER_CODE)' }
}

/** أقصى مدة فيديو يقبلها الرفع — 6 ساعات */
const MAX_DURATION = 6 * 3600
/** عمر رمز المشاهدة — ساعتان */
const TOKEN_TTL = 2 * 3600
/** لون أزرار مشغّل Stream — مرآة --gold-3: المشغّل iframe في نطاق Stream لا يقرأ متغيرات CSS (كالبريد وPDF) */
const PLAYER_ACCENT = '#c9a25a'

/** النطاقات المسموح لها بعرض الفيديو: نطاق المنصة وحده (من SITE_URL) */
export function allowedOrigins(): string[] {
  const site = siteUrl()
  return site ? [new URL(site).host] : []
}

/** رمز تشغيل قصير العمر — المشاهدة فقط: لا تنزيل. يُطلب بعد التحقق من حق المشاهد، ولا يخرج معرّف الفيديو في الرابط */
async function viewToken(uid: string): Promise<string | null> {
  if (!streamState().configured || !STREAM_UID.test(uid)) return null
  const r = await fetch(`${api()}/${uid}/token`, { method: 'POST', headers: auth(), body: JSON.stringify({ exp: Math.floor(Date.now() / 1000) + TOKEN_TTL, downloadable: false }) })
  if (!r.ok) return null
  const token = ((await r.json()) as { result?: { token?: string } }).result?.token
  return token && /^[\w.-]+$/.test(token) ? token : null
}

/** رابط المشغّل الموقّع (iframe) بصورة الغلاف الموقّعة وألوان الأكاديمية — null إن تعذّر */
export async function playbackUrl(uid: string, startSec = 0): Promise<string | null> {
  const token = await viewToken(uid)
  if (!token) return null
  const host = customerHost()
  const q = new URLSearchParams({
    startTime: `${Math.max(0, Math.floor(startSec))}s`,
    preload: 'metadata',
    letterboxColor: 'transparent',
    primaryColor: PLAYER_ACCENT,
    poster: `${host}/${token}/thumbnails/thumbnail.jpg?height=720`,
  })
  return `${host}/${token}/iframe?${q}`
}

type UploadMeta = { lessonId?: string | null; name: string }
export type UploadTicket = { uploadURL: string; uid: string; method: 'basic' | 'tus' }

/** رابط رفع مباشر بطلب واحد (حتى 200MB): المتصفح يرفع إلى Stream ولا يمرّ الملف بخادمنا */
export async function directUpload(m: UploadMeta): Promise<UploadTicket | null> {
  if (!streamState().configured) return null
  const body = { maxDurationSeconds: MAX_DURATION, requireSignedURLs: true, allowedOrigins: allowedOrigins(), meta: { name: m.name.slice(0, 200), lessonId: m.lessonId ?? '' } }
  const r = await fetch(`${api()}/direct_upload`, { method: 'POST', headers: auth(), body: JSON.stringify(body) })
  if (!r.ok) return null
  const j = (await r.json()) as { result?: { uploadURL?: string; uid?: string } }
  const { uploadURL, uid } = j.result ?? {}
  return uploadURL && uid && STREAM_UID.test(uid) ? { uploadURL, uid, method: 'basic' } : null
}

/** رفع tus للملفات الكبيرة: الخادم ينشئ الرفع (بالسرّ) ويعيد رابطه وحده؛ المتصفح يرسل الأجزاء إليه مباشرة */
export async function tusCreate(m: UploadMeta & { size: number }): Promise<UploadTicket | null> {
  if (!streamState().configured || !(m.size > 0)) return null
  const origins = allowedOrigins()
  const r = await fetch(`${api()}?direct_user=true`, {
    method: 'POST',
    headers: {
      authorization: auth().authorization,
      'Tus-Resumable': '1.0.0',
      'Upload-Length': String(Math.floor(m.size)),
      'Upload-Metadata': tusMetadata({ name: m.name.slice(0, 200), requiresignedurls: true, maxDurationSeconds: String(MAX_DURATION), allowedorigins: origins.join(',') }),
    },
  })
  const uploadURL = r.headers.get('location') ?? ''
  const uid = r.headers.get('stream-media-id') ?? ''
  if (!r.ok || (!/^https:\/\//.test(uploadURL) && !streamMock()) || !STREAM_UID.test(uid)) return null
  /* النطاقات وmeta بواجهة التعديل أيضاً — مفاتيح tus لا تضبط القائمة دائماً كما يُراد */
  await fetch(`${api()}/${uid}`, { method: 'POST', headers: auth(), body: JSON.stringify({ requireSignedURLs: true, allowedOrigins: origins, meta: { name: m.name.slice(0, 200), lessonId: m.lessonId ?? '' } }) }).catch(() => null)
  return { uploadURL, uid, method: 'tus' }
}

/** حالة الفيديو من Stream (GET /stream/{uid}) — null إن تعذّر السؤال */
export async function videoInfo(uid: string): Promise<StreamInfo | null> {
  if (!streamState().configured || !STREAM_UID.test(uid)) return null
  const r = await fetch(`${api()}/${uid}`, { headers: auth() }).catch(() => null)
  if (!r) return null
  if (r.status === 404) return { status: 'error', pct: 0, durationSeconds: null, thumbnailUrl: null, error: 'الفيديو غير موجود في Stream' }
  if (!r.ok) return null
  const v = ((await r.json()) as { result?: StreamVideo }).result
  return v ? fromStream(v) : null
}

/** تسجيل رابط Webhook لاكتمال المعالجة (واحد للحساب) — يعيد السرّ الذي يولّده Cloudflare للتوقيع */
export async function registerWebhook(url: string): Promise<string | null> {
  if (!streamState().configured || !/^https?:\/\//.test(url)) return null
  const r = await fetch(`${api()}/webhook`, { method: 'PUT', headers: auth(), body: JSON.stringify({ notificationUrl: url }) })
  if (!r.ok) return null
  const secret = ((await r.json()) as { result?: { secret?: string } }).result?.secret
  return secret || null
}

/* ───────── الترجمات النصية في Stream ───────── */
export type StreamCaption = { language: string; label: string; generated?: boolean; status?: string }

export async function streamCaptions(uid: string): Promise<StreamCaption[] | null> {
  if (!streamState().configured || !/^[a-f0-9]{32}$/.test(uid)) return null
  const r = await fetch(`${api()}/${uid}/captions`, { headers: auth() })
  if (!r.ok) return null
  const list = ((await r.json()) as { result?: unknown }).result
  return Array.isArray(list) ? (list as StreamCaption[]) : []
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
  const r = await fetch(`${api()}/copy`, { method: 'POST', headers: auth(), body: JSON.stringify({ url, meta: { name }, requireSignedURLs: true, allowedOrigins: allowedOrigins() }) })
  if (!r.ok) return null
  return ((await r.json()) as { result?: { uid?: string } }).result?.uid ?? null
}
