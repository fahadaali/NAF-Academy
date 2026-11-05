/* Zoom — دوال نقية: رقم الاجتماع من رابط الانضمام، والتحقق من توقيع الإشعار، واختيار ملف التسجيل. */
import { createHmac, timingSafeEqual } from 'node:crypto'

/** رقم الاجتماع من رابط مثل https://us02web.zoom.us/j/81234567890?pwd=… */
export function zoomMeetingId(url: string | null | undefined): string | null {
  const m = (url ?? '').match(/^https:\/\/([\w-]+\.)*zoom\.us\/(?:j|w|s)\/(\d{9,12})/i)
  return m ? m[2] : null
}

const hmac = (secret: string, msg: string) => createHmac('sha256', secret).update(msg).digest('hex')

/** توقيع Zoom: v0=HMAC(secret, "v0:{timestamp}:{body}") — ويُرفض ما مضى عليه أكثر من خمس دقائق */
export function verifyZoom(secret: string, timestamp: string | null, body: string, signature: string | null, now = Date.now()): boolean {
  if (!secret || !timestamp || !signature) return false
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(now - ts * 1000) > 5 * 60e3) return false
  const want = Buffer.from(`v0=${hmac(secret, `v0:${timestamp}:${body}`)}`)
  const got = Buffer.from(signature)
  return want.length === got.length && timingSafeEqual(want, got)
}

/** ردّ التحقق من الرابط عند تسجيله في Zoom */
export const zoomChallenge = (secret: string, plainToken: string) => ({ plainToken, encryptedToken: hmac(secret, plainToken) })

export type ZoomFile = { file_type?: string; recording_type?: string; status?: string; download_url?: string }

/** أفضل ملف فيديو: الشاشة مع المتحدث، ثم المتحدث، ثم أي MP4 مكتمل */
export function pickRecording(files: ZoomFile[]): ZoomFile | null {
  const mp4 = files.filter((f) => f.file_type === 'MP4' && (f.status ?? 'completed') === 'completed' && f.download_url)
  const order = ['shared_screen_with_speaker_view', 'shared_screen_with_gallery_view', 'active_speaker', 'gallery_view', 'shared_screen']
  return [...mp4].sort((a, b) => (order.indexOf(a.recording_type ?? '') + 1 || 99) - (order.indexOf(b.recording_type ?? '') + 1 || 99))[0] ?? null
}
