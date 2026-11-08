/* Webhook اكتمال المعالجة من Cloudflare Stream — يتحقق من Webhook-Signature (HMAC-SHA256 لـ «time.body» بسرّ Stream، وعمر ≤ 5 دقائق)
   ثم يحدّث حالة الفيديو ومدته وصورته على السجل ودروسه. مقفل حتى يُسجَّل الرابط من اللوحة («الجلسات والحضور ← Cloudflare Stream»). */
import { applyInfo, webhookSecret } from '@/server/stream-videos'
import { fromStream, STREAM_UID, verifyStreamSignature, type StreamVideo } from '@/lib/stream-status'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const secret = await webhookSecret()
  if (!secret) return new Response('Not found', { status: 404 })
  const body = await req.text()
  if (!verifyStreamSignature(req.headers.get('webhook-signature'), body, secret)) return new Response('Bad signature', { status: 401 })
  let v: StreamVideo
  try { v = JSON.parse(body) as StreamVideo } catch { return new Response('Bad request', { status: 400 }) }
  if (!v.uid || !STREAM_UID.test(v.uid)) return new Response('ok')
  await applyInfo(v.uid, fromStream(v))
  return new Response('ok')
}
