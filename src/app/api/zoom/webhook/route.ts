/* إشعارات Zoom — التحقق من التوقيع أولاً، ثم: تحقق تسجيل الرابط، أو إلحاق تسجيل اكتمل. مقفل بلا سرّ. */
import { verifyZoom, zoomChallenge } from '@/lib/zoom'
import { attachZoomRecording, zoomEnabled, zoomSecret } from '@/server/zoom'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const secret = zoomSecret()
  if (!secret) return new Response('Not found', { status: 404 })
  const body = await req.text()
  if (!verifyZoom(secret, req.headers.get('x-zm-request-timestamp'), body, req.headers.get('x-zm-signature'))) return new Response('Bad signature', { status: 401 })
  let j: { event?: string; download_token?: string; payload?: { plainToken?: string; object?: { id?: number | string; start_time?: string; topic?: string; recording_files?: unknown[] } } }
  try { j = JSON.parse(body) } catch { return new Response('Bad request', { status: 400 }) }
  if (j.event === 'endpoint.url_validation' && j.payload?.plainToken) return Response.json(zoomChallenge(secret, j.payload.plainToken))
  if (j.event !== 'recording.completed' || !(await zoomEnabled())) return Response.json({ ok: true, ignored: true })
  const o = j.payload?.object
  if (!o?.id || !o.start_time || !j.download_token) return Response.json({ ok: true, ignored: true })
  const result = await attachZoomRecording({ meetingId: String(o.id), startTime: o.start_time, topic: o.topic ?? '', files: (o.recording_files ?? []) as never, token: j.download_token })
  return Response.json({ ok: true, result })
}
