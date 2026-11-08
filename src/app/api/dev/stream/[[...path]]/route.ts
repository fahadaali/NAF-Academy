/* محاكاة Cloudflare Stream لاختبارات المتصفح وحدها (STREAM_MOCK=1، ممنوعة في الإنتاج): الرفع المباشر وtus والحالة والرمز وWebhook.
   الفيديو «يُعالَج» بعد ثانية ونصف من اكتمال رفعه. */
import { randomBytes } from 'node:crypto'
import { streamMock } from '@/server/stream'
import { siteUrl } from '@/server/site'

export const dynamic = 'force-dynamic'

type V = { uid: string; length: number; offset: number; doneAt: number | null; signed: boolean; origins: string[] }
const store = ((globalThis as { __streamMock?: Map<string, V> }).__streamMock ??= new Map())
const PROCESS_MS = 1500

const json = (result: unknown, status = 200) => Response.json({ success: status < 400, errors: [], messages: [], result }, { status })
const newUid = () => randomBytes(16).toString('hex')
const base = () => `${siteUrl()}/api/dev/stream`

function guard(req: Request, needAuth = true) {
  if (!streamMock()) return new Response('Not found', { status: 404 })
  if (needAuth && req.headers.get('authorization') !== 'Bearer mock') return json(null, 401)
  return null
}
const segs = async (ctx: { params: Promise<{ path?: string[] }> }) => (await ctx.params).path ?? []

function video(v: V) {
  const ready = v.doneAt !== null && Date.now() - v.doneAt > PROCESS_MS
  const state = v.doneAt === null ? 'pendingupload' : ready ? 'ready' : 'inprogress'
  return { uid: v.uid, readyToStream: ready, duration: ready ? 61.2 : -1, requireSignedURLs: v.signed, allowedOrigins: v.origins,
    thumbnail: `https://customer-mock.cloudflarestream.com/${v.uid}/thumbnails/thumbnail.jpg`, status: { state, pctComplete: ready ? '100' : v.doneAt ? '50' : '0' } }
}

export async function POST(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const p = await segs(ctx)
  /* رفع الملف نفسه — بلا ترويسة تفويض كما في Stream */
  if (p[0] === 'upload') {
    const g = guard(req, false); if (g) return g
    const v = store.get(p[1] ?? '')
    if (!v) return new Response('gone', { status: 404 })
    await req.arrayBuffer()
    v.doneAt = Date.now()
    return new Response(null, { status: 200 })
  }
  const g = guard(req); if (g) return g
  if (p.length === 0 && new URL(req.url).searchParams.get('direct_user') === 'true') {
    const uid = newUid()
    const length = Number(req.headers.get('upload-length') ?? 0)
    store.set(uid, { uid, length, offset: 0, doneAt: null, signed: /(^|,)requiresignedurls(,|$)/.test(req.headers.get('upload-metadata') ?? ''), origins: [] })
    return new Response(null, { status: 201, headers: { Location: `${base()}/tus/${uid}`, 'stream-media-id': uid, 'Tus-Resumable': '1.0.0' } })
  }
  if (p[0] === 'direct_upload') {
    const b = (await req.json()) as { requireSignedURLs?: boolean; allowedOrigins?: string[] }
    const uid = newUid()
    store.set(uid, { uid, length: 0, offset: 0, doneAt: null, signed: !!b.requireSignedURLs, origins: b.allowedOrigins ?? [] })
    return json({ uploadURL: `${base()}/upload/${uid}`, uid })
  }
  const v = store.get(p[0] ?? '')
  if (!v) return json(null, 404)
  if (p[1] === 'token') return json({ token: `mock.${randomBytes(24).toString('base64url')}` })
  /* تعديل الفيديو (النطاقات والتوقيع) */
  const b = (await req.json().catch(() => ({}))) as { requireSignedURLs?: boolean; allowedOrigins?: string[] }
  if (b.requireSignedURLs !== undefined) v.signed = b.requireSignedURLs
  if (b.allowedOrigins) v.origins = b.allowedOrigins
  return json(video(v))
}

export async function PATCH(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const g = guard(req, false); if (g) return g
  const p = await segs(ctx)
  const v = p[0] === 'tus' ? store.get(p[1] ?? '') : undefined
  if (!v) return new Response('gone', { status: 404 })
  if (Number(req.headers.get('upload-offset')) !== v.offset) return new Response('conflict', { status: 409 })
  v.offset += (await req.arrayBuffer()).byteLength
  if (v.offset >= v.length) v.doneAt = Date.now()
  return new Response(null, { status: 204, headers: { 'Upload-Offset': String(v.offset), 'Tus-Resumable': '1.0.0' } })
}

export async function HEAD(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const g = guard(req, false); if (g) return g
  const p = await segs(ctx)
  const v = p[0] === 'tus' ? store.get(p[1] ?? '') : undefined
  return v ? new Response(null, { status: 200, headers: { 'Upload-Offset': String(v.offset), 'Upload-Length': String(v.length) } }) : new Response(null, { status: 404 })
}

export async function GET(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const g = guard(req); if (g) return g
  const p = await segs(ctx)
  const v = store.get(p[0] ?? '')
  if (!v) return json(null, 404)
  return p[1] === 'captions' ? json([]) : json(video(v))
}

export async function PUT(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const g = guard(req); if (g) return g
  if ((await segs(ctx))[0] !== 'webhook') return json(null, 404)
  const b = (await req.json()) as { notificationUrl?: string }
  return json({ notificationUrl: b.notificationUrl, secret: 'mock-webhook-secret-0123456789abcdef' })
}
