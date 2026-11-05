/* الانضمام للجلسة المباشرة — الرابط الحقيقي لا يظهر في الصفحة؛ يُكشف هنا فقط للمسجّل داخل النافذة،
   ويُسجَّل حضوره. */
import { NextResponse } from 'next/server'
import { onProgress } from '@/server/notify/engine'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { currentLearner } from '@/server/learner-auth'
import { joinWindow } from '@/lib/learning'
import { hasAccess, withSession } from '@/lib/cohorts'
import { sessionsOf } from '@/server/cohorts'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, ctx: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await ctx.params
  const me = await currentLearner()
  if (!me) return NextResponse.redirect(new URL(`/login?next=/learn`, req.url), 303)
  const [row] = await db.select({ l: s.lessons, courseId: s.modules.courseId, slug: s.courses.slug }).from(s.lessons)
    .innerJoin(s.modules, eq(s.modules.id, s.lessons.moduleId)).innerJoin(s.courses, eq(s.courses.id, s.modules.courseId))
    /* دورة في المحذوفات لا تُفتح جلساتها */
    .where(and(eq(s.lessons.id, lessonId), isNull(s.courses.deletedAt)))
  if (!row || row.l.type !== 'live') return new Response('غير متاح', { status: 404 })
  const [en] = await db.select().from(s.enrollments).where(and(eq(s.enrollments.learnerId, me.id), eq(s.enrollments.courseId, row.courseId), eq(s.enrollments.status, 'active')))
  const back = new URL(`/learn/${row.slug}/${lessonId}`, req.url)
  if (!en || !hasAccess(en)) return NextResponse.redirect(back, 303)
  /* موعد الجلسة ورابطها من دفعة المتدرب إن كان في دفعة */
  const l = withSession(row.l, await sessionsOf(en.cohortId))
  if (!l.joinUrl) return new Response('غير متاح', { status: 404 })
  if (joinWindow(l.startsAt, l.endsAt).state !== 'open') return NextResponse.redirect(back, 303)
  const first = await db.insert(s.attendance).values({ learnerId: me.id, lessonId, courseId: row.courseId, method: 'join', by: 'self' }).onConflictDoNothing().returning({ at: s.attendance.at })
  if (first.length) await onProgress(me.id, row.courseId)
  return NextResponse.redirect(l.joinUrl, 303)
}
