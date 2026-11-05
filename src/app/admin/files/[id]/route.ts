/* تنزيل ملف خاص للفريق — التسليمات لمن يراجع، ومرفقات الدروس وترجماتها لمن يقرأ المحتوى، والعقود لمن يدير المؤسسات.
   المدرب محصور في دوراته: الملف لا يُنزَّل إلا إن كان من دورة من دوراته. */
import { eq, like } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { courseScope, currentStaff, staffCan } from '@/server/auth'
import { assetRow, serveAsset } from '@/server/assets'

export const dynamic = 'force-dynamic'

/** دورات الملف: تسليم متدرب، أو مرفق درس، أو ترجمة فيديو */
async function coursesOf(a: NonNullable<Awaited<ReturnType<typeof assetRow>>>): Promise<string[]> {
  if (a.scope === 'submission') return (await db.select({ c: s.submissions.courseId }).from(s.submissions).where(eq(s.submissions.assetId, a.id))).map((r) => r.c)
  const col = a.scope === 'caption' ? s.lessons.captions : s.lessons.attachments
  const rows = await db.select({ c: s.modules.courseId, list: col }).from(s.lessons).innerJoin(s.modules, eq(s.modules.id, s.lessons.moduleId)).where(like(col, `%${a.id}%`))
  return rows.filter((r) => (r.list as { assetId: string }[]).some((x) => x.assetId === a.id)).map((r) => r.c)
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const a = await assetRow(id)
  if (!a) return new Response('Not found', { status: 404 })
  const need = a.scope === 'submission' ? 'learning.review' : a.scope === 'contract' ? 'corporate.manage' : 'content.read'
  if (!(await staffCan(need))) return new Response('Forbidden', { status: 403 })
  if (a.scope !== 'contract') {
    const st = await currentStaff()
    const scope = st ? await courseScope(st) : []
    if (scope !== null && !(await coursesOf(a)).some((c) => scope.includes(c))) return new Response('Forbidden', { status: 403 })
  }
  return serveAsset(a)
}
