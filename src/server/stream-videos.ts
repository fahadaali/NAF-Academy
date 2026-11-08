import 'server-only'
/* سجل فيديوهات Stream وحالتها — جدول stream_videos (كل فيديو رُفع من المنصة أينما استُعمل)،
   ونسخة الحالة على الدرس (lessons.stream_*) لعرض اللوحة. المصادر: الرفع، وWebhook الاكتمال، والسؤال من اللوحة، والمشغّل الدوري. */
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db, schema as s } from './db'
import { inList } from './db/limits'
import { getSetting, setSetting } from './settings'
import { envVar } from './runtime'
import { videoInfo } from './stream'
import { STREAM_UID, type StreamInfo } from '@/lib/stream-status'

const now = () => new Date().toISOString()

/** فيديو جديد بانتظار الرفع — ويُعلَّم على درسه إن كان محفوظاً */
export async function trackUpload(uid: string, lessonId: string | null, name: string) {
  if (!STREAM_UID.test(uid)) return
  const [l] = lessonId ? await db.select({ id: s.lessons.id }).from(s.lessons).where(eq(s.lessons.id, lessonId)) : []
  await db.insert(s.streamVideos).values({ uid, lessonId: l?.id ?? null, name: name.slice(0, 200), status: 'pending' })
    .onConflictDoUpdate({ target: s.streamVideos.uid, set: { lessonId: l?.id ?? null, updatedAt: now() } })
  if (l) await db.update(s.lessons).set({ streamUid: uid, streamStatus: 'pending', durationSeconds: null, thumbnailUrl: null }).where(eq(s.lessons.id, l.id))
}

/** تطبيق حالة وصلت (من Stream مباشرة أو Webhook) على السجل وعلى كل درس يستعمل الفيديو */
export async function applyInfo(uid: string, info: StreamInfo) {
  if (!STREAM_UID.test(uid)) return
  const at = now()
  await db.insert(s.streamVideos).values({ uid, status: info.status, pct: info.pct, durationSeconds: info.durationSeconds, thumbnailUrl: info.thumbnailUrl, error: info.error, updatedAt: at })
    .onConflictDoUpdate({ target: s.streamVideos.uid, set: { status: info.status, pct: info.pct, durationSeconds: info.durationSeconds, thumbnailUrl: info.thumbnailUrl, error: info.error, updatedAt: at } })
  const set: Partial<typeof s.lessons.$inferInsert> = { streamStatus: info.status, durationSeconds: info.durationSeconds, thumbnailUrl: info.thumbnailUrl }
  await db.update(s.lessons).set(set).where(eq(s.lessons.streamUid, uid))
  /* مدة الدرس بالدقائق من المدة الحقيقية — لدروس الفيديو التي لم تُكتب مدتها */
  if (info.status === 'ready' && info.durationSeconds) {
    await db.update(s.lessons).set({ minutes: Math.max(1, Math.ceil(info.durationSeconds / 60)) })
      .where(and(eq(s.lessons.streamUid, uid), eq(s.lessons.minutes, 0)))
  }
}

/** يسأل Stream عن الفيديو ويحدّث — يعيد الحالة (أو المحفوظة إن تعذّر السؤال) */
export async function refreshVideo(uid: string): Promise<StreamInfo | null> {
  const info = await videoInfo(uid)
  if (info) { await applyInfo(uid, info); return info }
  const [row] = await db.select().from(s.streamVideos).where(eq(s.streamVideos.uid, uid))
  return row ? { status: row.status, pct: row.pct, durationSeconds: row.durationSeconds, thumbnailUrl: row.thumbnailUrl, error: row.error } : null
}

/** للمشغّل الدوري: ما عَلِق في الانتظار أو المعالجة (الأقدم تحديثاً أولاً) */
export async function refreshUnsettled(limit = 20): Promise<number> {
  const rows = await db.select({ uid: s.streamVideos.uid }).from(s.streamVideos)
    .where(inArray(s.streamVideos.status, ['pending', 'processing'])).orderBy(s.streamVideos.updatedAt).limit(limit)
  for (const r of rows) await refreshVideo(r.uid).catch((e) => console.error('stream refresh', (e as Error).message))
  return rows.length
}

/** بعد حفظ دورة: نسخة الحالة على دروسها تتبع مصدر الفيديو المحفوظ (فيديو Stream جديد يُسجَّل ويُسأل عنه لاحقاً) */
export async function syncCourseLessons(courseId: string) {
  const rows = await db.select({ id: s.lessons.id, video: s.lessons.video, streamUid: s.lessons.streamUid }).from(s.lessons)
    .innerJoin(s.modules, eq(s.modules.id, s.lessons.moduleId)).where(eq(s.modules.courseId, courseId))
  const uids = [...new Set(rows.flatMap((r) => (r.video?.provider === 'stream' && STREAM_UID.test(r.video.uid) ? [r.video.uid] : [])))]
  const known = uids.length ? await db.select().from(s.streamVideos).where(inList(s.streamVideos.uid, uids)) : []
  const byUid = new Map(known.map((k) => [k.uid, k]))
  for (const u of uids) if (!byUid.has(u)) await db.insert(s.streamVideos).values({ uid: u, status: 'pending' }).onConflictDoNothing()
  for (const r of rows) {
    const uid = r.video?.provider === 'stream' && STREAM_UID.test(r.video.uid) ? r.video.uid : null
    if (uid === r.streamUid && uid !== null) continue
    const k = uid ? byUid.get(uid) : undefined
    await db.update(s.lessons).set(uid
      ? { streamUid: uid, streamStatus: k?.status ?? 'pending', durationSeconds: k?.durationSeconds ?? null, thumbnailUrl: k?.thumbnailUrl ?? null }
      : { streamUid: null, streamStatus: null, durationSeconds: null, thumbnailUrl: null }).where(eq(s.lessons.id, r.id))
    if (k?.lessonId == null && uid) await db.update(s.streamVideos).set({ lessonId: r.id }).where(and(eq(s.streamVideos.uid, uid), sql`${s.streamVideos.lessonId} is null`))
  }
}

/** آخر الفيديوهات للّوحة */
export async function recentVideos(limit = 12) {
  return db.select({ uid: s.streamVideos.uid, name: s.streamVideos.name, status: s.streamVideos.status, pct: s.streamVideos.pct, durationSeconds: s.streamVideos.durationSeconds, error: s.streamVideos.error, updatedAt: s.streamVideos.updatedAt, lessonTitle: s.lessons.title })
    .from(s.streamVideos).leftJoin(s.lessons, eq(s.lessons.id, s.streamVideos.lessonId)).orderBy(sql`${s.streamVideos.createdAt} desc`).limit(limit)
}
export const anyUnsettled = async () => (await db.select({ n: sql<number>`count(*)` }).from(s.streamVideos).where(inArray(s.streamVideos.status, ['pending', 'processing'])))[0]?.n > 0

/* ───────── سرّ Webhook ─────────
   يولّده Cloudflare عند تسجيل الرابط ويُحفظ في القاعدة دون أن يُعرض (أو من السرّ CF_STREAM_WEBHOOK_SECRET إن أُضيف). */
const HOOK_KEY = 'stream_webhook'
type Hook = { secret: string; url: string; at: string }
export async function webhookSecret(): Promise<string> {
  const env = envVar('CF_STREAM_WEBHOOK_SECRET')
  if (env) return env
  return (await getSetting<Hook | null>(HOOK_KEY, null))?.secret ?? ''
}
export async function webhookView(): Promise<{ on: boolean; url: string; at: string | null; fromEnv: boolean }> {
  const h = await getSetting<Hook | null>(HOOK_KEY, null)
  const fromEnv = !!envVar('CF_STREAM_WEBHOOK_SECRET')
  return { on: fromEnv || !!h?.secret, url: h?.url ?? '', at: h?.at ?? null, fromEnv }
}
export const saveWebhook = (secret: string, url: string) => setSetting(HOOK_KEY, { secret, url, at: now() } satisfies Hook)

