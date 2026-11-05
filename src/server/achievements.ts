import 'server-only'
/* منح الإنجازات وإشعارات المنصة — بعد كل تقدّم وعند صدور شهادة. الإنجاز الجديد يصير إشعاراً داخل المنصة. */
import { randomUUID } from 'node:crypto'
import { and, count, desc, eq, isNotNull, isNull } from 'drizzle-orm'
import { db, schema as s } from './db'
import { ACHIEVEMENTS, earned, type AchievementKind } from '@/lib/achievements'

/** إشعار داخل المنصة — المفتاح الفريد يمنع التكرار */
export async function toInbox(learnerId: string, v: { key: string; kind: string; title: string; body?: string; url?: string }) {
  await db.insert(s.inbox).values({ id: randomUUID(), key: v.key, learnerId, kind: v.kind, title: v.title.slice(0, 200), body: (v.body ?? '').slice(0, 600), url: v.url ?? '' })
    .onConflictDoNothing({ target: s.inbox.key })
}

export async function evaluateAchievements(learnerId: string) {
  const { progressOf } = await import('./notify/engine')
  const enr = await db.select({ courseId: s.enrollments.courseId, trackId: s.courses.trackId }).from(s.enrollments)
    .innerJoin(s.courses, eq(s.courses.id, s.enrollments.courseId))
    .where(and(eq(s.enrollments.learnerId, learnerId), eq(s.enrollments.status, 'active'), isNull(s.courses.deletedAt)))
  const prog = await progressOf(enr.map((e) => ({ learnerId, courseId: e.courseId })))
  const [[done], [att], [certs], perfect, tracks] = await Promise.all([
    db.select({ n: count() }).from(s.lessonProgress).where(and(eq(s.lessonProgress.learnerId, learnerId), isNotNull(s.lessonProgress.completedAt))),
    db.select({ n: count() }).from(s.attendance).where(eq(s.attendance.learnerId, learnerId)),
    db.select({ n: count() }).from(s.certificates).where(and(eq(s.certificates.learnerId, learnerId), eq(s.certificates.status, 'issued'))),
    db.select({ id: s.quizAttempts.id }).from(s.quizAttempts).where(and(eq(s.quizAttempts.learnerId, learnerId), eq(s.quizAttempts.scorePct, 100))).limit(1),
    db.select({ id: s.courses.id, trackId: s.courses.trackId }).from(s.courses).where(and(isNull(s.courses.deletedAt), eq(s.courses.status, 'open'))),
  ])
  const trackCourses = new Map<string, string[]>()
  for (const c of tracks) if (c.trackId) trackCourses.set(c.trackId, [...(trackCourses.get(c.trackId) ?? []), c.id])
  const got = earned({
    lessonsDone: done.n, attended: att.n, certificates: certs.n, perfectQuiz: perfect.length > 0, trackCourses,
    courses: enr.map((e) => ({ id: e.courseId, trackId: e.trackId, pct: prog.get(`${learnerId}:${e.courseId}`)?.pct ?? 0 })),
  })
  for (const g of got) {
    const ins = await db.insert(s.achievements).values({ id: randomUUID(), learnerId, kind: g.kind, ref: g.ref }).onConflictDoNothing().returning({ id: s.achievements.id })
    if (!ins.length) continue
    const a = ACHIEVEMENTS[g.kind]
    await toInbox(learnerId, { key: `ach:${learnerId}:${g.kind}:${g.ref}`, kind: 'achievement', title: `إنجاز جديد: ${a.title}`, body: a.body, url: '/learn#achievements' })
  }
}

export type BadgeView = { kind: AchievementKind; title: string; body: string; glyph: string; ref: string; refTitle: string; at: string }

export async function learnerAchievements(learnerId: string): Promise<BadgeView[]> {
  const rows = await db.select().from(s.achievements).where(eq(s.achievements.learnerId, learnerId)).orderBy(desc(s.achievements.earnedAt))
  const titles = new Map<string, string>()
  if (rows.some((r) => r.ref)) {
    for (const c of await db.select({ id: s.courses.id, t: s.courses.title }).from(s.courses)) titles.set(c.id, c.t.replace(/~\d/g, ''))
    for (const t of await db.select({ id: s.tracks.id, t: s.tracks.title }).from(s.tracks)) titles.set(t.id, t.t)
  }
  return rows.filter((r) => r.kind in ACHIEVEMENTS).map((r) => {
    const a = ACHIEVEMENTS[r.kind as AchievementKind]
    return { kind: r.kind as AchievementKind, title: a.title, body: a.body, glyph: a.glyph, ref: r.ref, refTitle: titles.get(r.ref) ?? '', at: r.earnedAt }
  })
}

/** الإشعارات للجرس وصفحة الإشعارات */
export async function inboxOf(learnerId: string, limit = 50) {
  const rows = await db.select().from(s.inbox).where(eq(s.inbox.learnerId, learnerId)).orderBy(desc(s.inbox.createdAt)).limit(limit)
  const [u] = await db.select({ n: count() }).from(s.inbox).where(and(eq(s.inbox.learnerId, learnerId), isNull(s.inbox.readAt)))
  return { rows, unread: u.n }
}
