/* تنزيل الملفات الخاصة للمتدرب: مرفق الدرس للمسجّل في دورته (أو لأي زائر إن كان الدرس معاينة)، والتسليم لصاحبه.
   الفريق ينزّل من /admin/files/[id] حيث تصل هويته عبر الوسيط. */
import { and, eq, like } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { currentLearner } from '@/server/learner-auth'
import { assetRow, serveAsset } from '@/server/assets'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const a = await assetRow(id)
  if (!a) return new Response('Not found', { status: 404 })
  const me = await currentLearner()
  let ok = false
  if (a.scope === 'submission') ok = !!me && a.ownerLearnerId === me.id
  if (a.scope === 'lesson') {
    const rows = await db.select({ courseId: s.modules.courseId, preview: s.lessons.preview, attachments: s.lessons.attachments }).from(s.lessons)
      .innerJoin(s.modules, eq(s.modules.id, s.lessons.moduleId)).where(like(s.lessons.attachments, `%${id}%`))
    for (const r of rows) {
      if (ok || !r.attachments.some((x) => x.assetId === id)) continue
      if (r.preview) { ok = true; continue }
      if (!me) continue
      const [en] = await db.select().from(s.enrollments).where(and(eq(s.enrollments.learnerId, me.id), eq(s.enrollments.courseId, r.courseId), eq(s.enrollments.status, 'active')))
      if (en) ok = true
    }
  }
  if (!ok) return new Response('Forbidden', { status: 403 })
  return serveAsset(a)
}
