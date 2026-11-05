/* الانضمام للجلسة المباشرة — الرابط الحقيقي لا يظهر في الصفحة؛ يُكشف هنا فقط للمسجّل داخل النافذة،
   ويُسجَّل حضوره. */
import { NextResponse } from 'next/server'
import { onProgress } from '@/server/notify/engine'
import { and, eq } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { currentLearner } from '@/server/learner-auth'
import { joinWindow } from '@/lib/learning'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, ctx: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await ctx.params
  const me = await currentLearner()
  if (!me) return NextResponse.redirect(new URL(`/login?next=/learn`, req.url), 303)
  const [row] = await db.select({ l: s.lessons, courseId: s.modules.courseId, slug: s.courses.slug }).from(s.lessons)
    .innerJoin(s.modules, eq(s.modules.id, s.lessons.moduleId)).innerJoin(s.courses, eq(s.courses.id, s.modules.courseId)).where(eq(s.lessons.id, lessonId))
  if (!row || row.l.type !== 'live' || !row.l.joinUrl) return new Response('غير متاح', { status: 404 })
  const [en] = await db.select().from(s.enrollments).where(and(eq(s.enrollments.learnerId, me.id), eq(s.enrollments.courseId, row.courseId), eq(s.enrollments.status, 'active')))
  const back = new URL(`/learn/${row.slug}/${lessonId}`, req.url)
  if (!en) return NextResponse.redirect(back, 303)
  if (joinWindow(row.l.startsAt, row.l.endsAt).state !== 'open') return NextResponse.redirect(back, 303)
  const first = await db.insert(s.attendance).values({ learnerId: me.id, lessonId, courseId: row.courseId, method: 'join', by: 'self' }).onConflictDoNothing().returning({ at: s.attendance.at })
  if (first.length) await onProgress(me.id, row.courseId)
  return NextResponse.redirect(row.l.joinUrl, 303)
}
