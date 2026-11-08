/* المشغّل الدوري للرسائل — يستدعيه معالج scheduled في Worker كل 5 دقائق بسرّ CRON_SECRET.
   في التطوير فقط: ?now= لتجربة الجدولة بوقت مزيّف. */
import { timingSafeEqual } from 'node:crypto'
import { runNotifications } from '@/server/notify/engine'
import { envVar } from '@/server/runtime'
import { autoMigrate } from '@/server/setup'
import { streamState } from '@/server/stream'
import { refreshUnsettled } from '@/server/stream-videos'
import { retryWafeq } from '@/server/wafeq/sync'
import { resumeFulfillment, retryOrphanRefunds } from '@/server/sales'

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
  /* المال أولاً: طلبات مدفوعة انقطع تنفيذها تُستأنف، ودفعات مقبوضة يتيمة فشل استردادها تُعاد (بتراجع وسقف) */
  let fulfilled = 0
  try { fulfilled = await resumeFulfillment(now) } catch (e) { console.error('resume fulfillment', (e as Error).message) }
  let orphans: Awaited<ReturnType<typeof retryOrphanRefunds>> | null = null
  try { orphans = await retryOrphanRefunds(now) } catch (e) { console.error('orphan refunds', (e as Error).message) }
  /* وافق: المستندات المعلّقة قبل الرسائل — فيخرج بريد «تم الدفع» بفاتورتها الرسمية */
  let wafeq: Awaited<ReturnType<typeof retryWafeq>> | null = null
  try { wafeq = await retryWafeq(now) } catch (e) { console.error('wafeq retry', (e as Error).message) }
  const r = await runNotifications(now)
  /* فيديوهات Stream العالقة في الانتظار أو المعالجة — احتياط إن لم يصل Webhook الاكتمال */
  let stream = 0
  if (streamState().configured) try { stream = await refreshUnsettled() } catch (e) { console.error('stream refresh', (e as Error).message) }
  return Response.json({ ...r, migrated, stream, wafeq, fulfilled, orphans })
}
