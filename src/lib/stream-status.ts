/* Cloudflare Stream — دوال نقية مختبرة: تحويل حالة الفيديو، والتحقق من توقيع Webhook، وترويسة tus وتقسيم أجزائها.
   لا أسرار هنا ولا شبكة؛ الاستدعاءات في src/server/stream.ts. */
import { createHmac, timingSafeEqual } from 'node:crypto'

export type StreamStatus = 'pending' | 'processing' | 'ready' | 'error'
export type StreamInfo = { status: StreamStatus; pct: number; durationSeconds: number | null; thumbnailUrl: string | null; error: string }

/** شكل الفيديو كما تعيده Stream (GET /stream/{uid} وجسم Webhook) — الحقول التي نقرؤها فقط */
export type StreamVideo = {
  uid?: string
  readyToStream?: boolean
  duration?: number
  thumbnail?: string
  status?: { state?: string; pctComplete?: string | number; errorReasonCode?: string; errorReasonText?: string }
  meta?: Record<string, unknown>
}

export const STREAM_UID = /^[a-f0-9]{32}$/

/** حالة Stream ← حالتنا: pendingupload ← pending، downloading/queued/inprogress ← processing، ready ← ready، error ← error */
export function fromStream(v: StreamVideo): StreamInfo {
  const state = String(v.status?.state ?? '').toLowerCase()
  const pct = Math.max(0, Math.min(100, Math.round(Number(v.status?.pctComplete ?? 0) || 0)))
  const status: StreamStatus = state === 'error' ? 'error'
    : v.readyToStream || state === 'ready' ? 'ready'
    : state === 'pendingupload' || state === '' ? 'pending'
    : 'processing'
  const duration = typeof v.duration === 'number' && v.duration > 0 ? Math.round(v.duration) : null
  const thumb = typeof v.thumbnail === 'string' && /^https:\/\//.test(v.thumbnail) ? v.thumbnail : null
  const error = status === 'error' ? String(v.status?.errorReasonText || v.status?.errorReasonCode || 'خطأ في المعالجة').slice(0, 300) : ''
  return { status, pct: status === 'ready' ? 100 : pct, durationSeconds: duration, thumbnailUrl: thumb, error }
}

/** هل ما زال يحتاج سؤالاً؟ */
export const unsettled = (s: string | null | undefined) => s === 'pending' || s === 'processing'

/** التحقق من Webhook-Signature: «time=…,sig1=…» — HMAC-SHA256 لـ «time.body» بسرّ Stream، وبعمر لا يتجاوز maxAge ثانية */
export function verifyStreamSignature(header: string | null, body: string, secret: string, nowSec = Math.floor(Date.now() / 1000), maxAge = 300): boolean {
  if (!header || !secret) return false
  const parts = Object.fromEntries(header.split(',').map((p) => { const i = p.indexOf('='); return [p.slice(0, i).trim(), p.slice(i + 1).trim()] }))
  const time = Number(parts.time)
  const sig = parts.sig1 ?? ''
  if (!Number.isFinite(time) || !/^[a-f0-9]{64}$/i.test(sig) || Math.abs(nowSec - time) > maxAge) return false
  const want = createHmac('sha256', secret).update(`${parts.time}.${body}`).digest('hex')
  return timingSafeEqual(Buffer.from(want), Buffer.from(sig.toLowerCase()))
}

/** ترويسة Upload-Metadata لـ tus: «مفتاح قيمة-base64» بفواصل، والمفتاح بلا قيمة يُكتب وحده */
export function tusMetadata(meta: Record<string, string | true>): string {
  return Object.entries(meta).map(([k, v]) => (v === true ? k : `${k} ${Buffer.from(v, 'utf8').toString('base64')}`)).join(',')
}
