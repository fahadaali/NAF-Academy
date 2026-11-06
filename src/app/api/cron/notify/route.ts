/* المشغّل الدوري للرسائل — يستدعيه معالج scheduled في Worker كل 5 دقائق بسرّ CRON_SECRET.
   في التطوير فقط: ?now= لتجربة الجدولة بوقت مزيّف. */
import { timingSafeEqual } from 'node:crypto'
import { runNotifications } from '@/server/notify/engine'
import { envVar } from '@/server/runtime'
import { autoMigrate } from '@/server/setup'

export const dynamic = 'force-dynamic'

function authorized(req: Request) {
  const want = envVar('CRON_SECRET') ?? ''
  if (want.length < 24) return false
  const got = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const a = Buffer.from(want), b = Buffer.from(got)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: Request) {
  if (!authorized(req)) return new Response('Unauthorized', { status: 401 })
  const q = new URL(req.url).searchParams.get('now')
  const now = q && process.env.NODE_ENV !== 'production' && !Number.isNaN(Date.parse(q)) ? new Date(q) : new Date()
  /* بعد كل نشر: ترحيلات جديدة تُطبَّق وحدها هنا (كل 5 دقائق) — قبل أي استعلام يحتاجها */
  let migrated: Awaited<ReturnType<typeof autoMigrate>> = null
  try { migrated = await autoMigrate() } catch (e) { console.error('auto-migrate', e) }
  if (migrated?.error) console.error('auto-migrate', migrated.error)
  const r = await runNotifications(now)
  return Response.json({ ...r, migrated })
}
