/* تنزيل ملف خاص للفريق — التسليمات لمن يراجع، ومرفقات الدروس لمن يقرأ المحتوى */
import { staffCan } from '@/server/auth'
import { assetRow, serveAsset } from '@/server/assets'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const a = await assetRow(id)
  if (!a) return new Response('Not found', { status: 404 })
  const need = a.scope === 'submission' ? 'learning.review' : a.scope === 'contract' ? 'corporate.manage' : 'content.read'
  if (!(await staffCan(need))) return new Response('Forbidden', { status: 403 })
  return serveAsset(a)
}
