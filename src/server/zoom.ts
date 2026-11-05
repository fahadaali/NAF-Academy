import 'server-only'
/* Zoom — تسجيلات الجلسات تُلحق تلقائياً: إشعار recording.completed ← نسخ الملف إلى Stream ← تسجيل الدرس أو جلسة الدفعة.
   مقفل حتى يُضاف ZOOM_WEBHOOK_SECRET ويُفعَّل من اللوحة؛ وبدونه يبقى الإلحاق يدوياً. */
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema as s } from './db'
import { envVar } from './runtime'
import { getSetting, setSetting } from './settings'
import { audit } from './audit'
import { streamCopy, streamState } from './stream'
import { pickRecording, type ZoomFile } from '@/lib/zoom'

export function zoomState() {
  return envVar('ZOOM_WEBHOOK_SECRET') ? { configured: true as const } : { configured: false as const, problem: 'سرّ إشعارات Zoom غير مضاف (ZOOM_WEBHOOK_SECRET)' }
}
export const zoomSecret = () => envVar('ZOOM_WEBHOOK_SECRET') ?? ''
export async function zoomEnabled() {
  return zoomState().configured && (await getSetting<{ enabled?: boolean }>('zoom', { enabled: false })).enabled === true
}
export const setZoomEnabled = (enabled: boolean) => setSetting('zoom', { enabled })

const H12 = 12 * 3600e3
const near = (a: string | null, b: number) => (a ? Math.abs(Date.parse(a) - b) : Infinity)

/** يلحق تسجيلاً اكتمل في Zoom بجلسته — الأقرب موعداً لرقم الاجتماع (خلال 12 ساعة). يعيد ما حدث للسجل */
export async function attachZoomRecording(p: { meetingId: string; startTime: string; topic: string; files: ZoomFile[]; token: string }): Promise<string> {
  const start = Date.parse(p.startTime)
  const [sess, own] = await Promise.all([
    db.select().from(s.cohortSessions).where(eq(s.cohortSessions.zoomMeetingId, p.meetingId)),
    db.select().from(s.lessons).where(and(eq(s.lessons.zoomMeetingId, p.meetingId), eq(s.lessons.type, 'live'))),
  ])
  const a = sess.filter((x) => near(x.startsAt, start) < H12).sort((x, y) => near(x.startsAt, start) - near(y.startsAt, start))[0]
  const b = own.filter((x) => near(x.startsAt, start) < H12).sort((x, y) => near(x.startsAt, start) - near(y.startsAt, start))[0]
  const target = a && (!b || near(a.startsAt, start) <= near(b.startsAt, start)) ? { kind: 'cohort' as const, lessonId: a.lessonId, cohortId: a.cohortId, has: a.recording } : b ? { kind: 'lesson' as const, lessonId: b.id, cohortId: null, has: b.recording } : null
  if (!target) return 'لا جلسة مطابقة'
  if (target.has && target.has.provider !== 'none') return 'للجلسة تسجيل من قبل'
  const file = pickRecording(p.files)
  if (!file?.download_url) return 'لا ملف فيديو في التسجيل'
  if (!streamState().configured) {
    await audit('zoom', 'needs_attention', 'lesson', target.lessonId, `تسجيل «${p.topic}» جاهز في Zoom ولم يُنسخ — Stream غير مربوط؛ أضفه يدوياً`)
    return 'Stream غير مربوط'
  }
  const sep = file.download_url.includes('?') ? '&' : '?'
  const uid = await streamCopy(`${file.download_url}${sep}access_token=${encodeURIComponent(p.token)}`, p.topic.slice(0, 120))
  if (!uid) {
    await audit('zoom', 'needs_attention', 'lesson', target.lessonId, `تعذّر نسخ تسجيل «${p.topic}» إلى Stream — أضفه يدوياً`)
    return 'تعذّر النسخ'
  }
  const recording = { provider: 'stream' as const, uid }
  if (target.kind === 'cohort') await db.update(s.cohortSessions).set({ recording, updatedAt: new Date().toISOString() }).where(and(eq(s.cohortSessions.cohortId, target.cohortId!), eq(s.cohortSessions.lessonId, target.lessonId)))
  else await db.update(s.lessons).set({ recording }).where(and(eq(s.lessons.id, target.lessonId), isNull(s.lessons.recording)))
  await audit('zoom', 'recording', 'lesson', target.lessonId, `أُلحق تسجيل «${p.topic}» تلقائياً`)
  const { onRecordingReady } = await import('./notify/engine')
  await onRecordingReady(target.lessonId, target.cohortId)
  return 'أُلحق'
}
