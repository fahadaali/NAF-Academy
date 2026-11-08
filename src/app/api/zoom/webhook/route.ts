/* إشعارات Zoom — التحقق من التوقيع أولاً، ثم: تحقق تسجيل الرابط، أو إلحاق تسجيل اكتمل. مقفل بلا سرّ.
   الحدث المكرر يُقرّ بلا معالجة: بهويته (الحدث + event_ts + الاجتماع) فتسقط إعادات Zoom نفسها بتوقيع جديد،
   أو بتجزيء الطلب الموقّع إن غابت الهوية (إعادة التشغيل). وما تعذّرت معالجته يُنسى فتُقبل إعادته. */
import { createHash } from 'node:crypto'
import { verifyZoom, zoomChallenge } from '@/lib/zoom'
import { firstSeen, forgetSeen } from '@/server/ratelimit'
import { attachZoomRecording, zoomEnabled, zoomSecret } from '@/server/zoom'

export const dynamic = 'force-dynamic'

/* Zoom يعيد الإرسال حتى ساعة ونصف بعد الأول (5 ثم 30 ثم 90 دقيقة) — النافذة تغطيها */
const ZOOM_WINDOW = 3 * 3600e3
const sha = (x: string) => createHash('sha256').update(x).digest('hex')

export async function POST(req: Request) {
  const secret = zoomSecret()
  if (!secret) return new Response('Not found', { status: 404 })
  const body = await req.text()
  if (!verifyZoom(secret, req.headers.get('x-zm-request-timestamp'), body, req.headers.get('x-zm-signature'))) return new Response('Bad signature', { status: 401 })
  let j: { event?: string; event_ts?: number | string; download_token?: string; payload?: { plainToken?: string; object?: { id?: number | string; uuid?: string; start_time?: string; topic?: string; recording_files?: unknown[] } } }
  try { j = JSON.parse(body) } catch { return new Response('Bad request', { status: 400 }) }
  if (j.event === 'endpoint.url_validation' && j.payload?.plainToken) return Response.json(zoomChallenge(secret, j.payload.plainToken))
  if (j.event !== 'recording.completed' || !(await zoomEnabled())) return Response.json({ ok: true, ignored: true })
  const o = j.payload?.object
  if (!o?.id || !o.start_time || !j.download_token) return Response.json({ ok: true, ignored: true })
  const key = `zoom:${sha(j.event_ts ? `${j.event}|${j.event_ts}|${o.uuid ?? ''}|${o.id}` : `${req.headers.get('x-zm-request-timestamp')}:${body}`)}`
  if (!(await firstSeen(key, ZOOM_WINDOW))) return Response.json({ ok: true, duplicate: true })
  try {
    const result = await attachZoomRecording({ meetingId: String(o.id), startTime: o.start_time, topic: o.topic ?? '', files: (o.recording_files ?? []) as never, token: j.download_token })
    return Response.json({ ok: true, result })
  } catch (e) {
    await forgetSeen(key)
    throw e
  }
}
