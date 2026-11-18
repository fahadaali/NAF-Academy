/* حالة المتدرب الداخل في دورة — لزرّ صفحة الدورة العامة (المخزّنة للجميع فلا تعرف الزائر):
   «ادخل إلى الدورة» للمسجّل، و«أكمل بياناتك» لمن تنقصه البيانات الإلزامية، و«جدّد» للمنتهي وصوله.
   لا يُخرج إلا حالة واحدة، ولا يُخزَّن. */
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { currentLearner } from '@/server/learner-auth'
import { hasAccess } from '@/lib/cohorts'
import { identityGaps } from '@/lib/identity'

export const dynamic = 'force-dynamic'

export type MyCourseState = 'none' | 'enrolled' | 'profile' | 'expired'

const reply = (state: MyCourseState) => Response.json({ state }, { headers: { 'Cache-Control': 'private, no-store' } })

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return reply('none')
  const me = await currentLearner()
  if (!me) return reply('none')
  const [row] = await db.select({ e: s.enrollments }).from(s.enrollments)
    .innerJoin(s.courses, eq(s.courses.id, s.enrollments.courseId))
    .where(and(eq(s.courses.slug, slug), isNull(s.courses.deletedAt), eq(s.enrollments.learnerId, me.id), eq(s.enrollments.status, 'active')))
  if (!row) return reply('none')
  if (!hasAccess(row.e)) return reply('expired')
  return reply(identityGaps(me).length ? 'profile' : 'enrolled')
}
