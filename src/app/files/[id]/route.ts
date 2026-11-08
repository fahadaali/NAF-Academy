/* تنزيل الملفات الخاصة للمتدرب: مرفق الدرس للمسجّل في دورته (أو لأي زائر إن كان الدرس معاينة في دورة عامة ظاهرة)، والتسليم لصاحبه.
   الفريق ينزّل من /admin/files/[id] حيث تصل هويته عبر الوسيط. */
import { and, eq, isNull, like, or } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { currentLearner } from '@/server/learner-auth'
import { assetRow, serveAsset } from '@/server/assets'
import { hasAccess } from '@/lib/cohorts'
import { previewOpen } from '@/lib/learning'

export const dynamic = 'force-dynamic'

/** طلب يفتح الملف صفحةً أو إطاراً (عارض PDF في المتصفح بزر تنزيله) — لا جلباً من عارض السلايدات (fetch ← Sec-Fetch-Dest: empty) */
const DOC_DEST = new Set(['document', 'iframe', 'frame', 'embed', 'object'])

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const a = await assetRow(id)
  if (!a) return new Response('Not found', { status: 404 })
  const me = await currentLearner()
  const inline = new URL(req.url).searchParams.has('inline')
  let ok = false
  /* ملف سلايدات قُفل تنزيله: يُقدَّم مضمّناً لعارضها وحده */
  let downloadable = true
  if (a.scope === 'submission') ok = !!me && a.ownerLearnerId === me.id
  const course = { visibility: s.courses.visibility, status: s.courses.status, publishAt: s.courses.publishAt }
  if (a.scope === 'caption') {
    /* ترجمة فيديو: لمن يحق له الدرس (المسجّل الساري وصوله، أو أي زائر لدرس معاينة في دورة عامة ظاهرة) */
    const rows = await db.select({ courseId: s.modules.courseId, preview: s.lessons.preview, captions: s.lessons.captions, ...course }).from(s.lessons)
      .innerJoin(s.modules, eq(s.modules.id, s.lessons.moduleId)).innerJoin(s.courses, eq(s.courses.id, s.modules.courseId))
      /* دورة في المحذوفات لا تُنزَّل ملفاتها */
      .where(and(like(s.lessons.captions, `%${id}%`), isNull(s.courses.deletedAt)))
    for (const r of rows) {
      if (ok || !r.captions.some((x) => x.assetId === id)) continue
      if (r.preview && previewOpen(r)) { ok = true; continue }
      if (!me) continue
      const [en] = await db.select().from(s.enrollments).where(and(eq(s.enrollments.learnerId, me.id), eq(s.enrollments.courseId, r.courseId), eq(s.enrollments.status, 'active')))
      if (hasAccess(en)) ok = true
    }
    if (ok) {
      const bytes = await (await import('@/server/storage')).getObject(a.key)
      return bytes ? new Response(bytes as BodyInit, { headers: { 'content-type': 'text/vtt; charset=utf-8', 'cache-control': 'private, max-age=300', 'x-content-type-options': 'nosniff' } }) : new Response('Not found', { status: 404 })
    }
  }
  if (a.scope === 'lesson') {
    /* مرفق درس أو ملف سلايداته */
    const rows = await db.select({ courseId: s.modules.courseId, preview: s.lessons.preview, attachments: s.lessons.attachments, slides: s.lessons.slides, ...course }).from(s.lessons)
      .innerJoin(s.modules, eq(s.modules.id, s.lessons.moduleId)).innerJoin(s.courses, eq(s.courses.id, s.modules.courseId))
      /* دورة في المحذوفات لا تُنزَّل ملفاتها */
      .where(and(or(like(s.lessons.attachments, `%${id}%`), like(s.lessons.slides, `%${id}%`)), isNull(s.courses.deletedAt)))
    downloadable = false
    for (const r of rows) {
      const attached = r.attachments.some((x) => x.assetId === id)
      if (!attached && r.slides?.assetId !== id) continue
      let mine = r.preview && previewOpen(r)
      if (!mine && me) {
        const [en] = await db.select().from(s.enrollments).where(and(eq(s.enrollments.learnerId, me.id), eq(s.enrollments.courseId, r.courseId), eq(s.enrollments.status, 'active')))
        mine = hasAccess(en)
      }
      if (!mine) continue
      ok = true
      /* المرفق يُنزَّل دائماً، والسلايدات بخيار «السماح بالتنزيل» */
      if (attached || r.slides?.download) downloadable = true
    }
  }
  if (!ok) return new Response('Forbidden', { status: 403 })
  if (!downloadable) {
    /* قفل التنزيل: لا مرفق (attachment)، ولا فتح الملف صفحةً بعارض المتصفح وزر تنزيله — العرض داخل عارض السلايدات وحده.
       المنع الكامل غير ممكن: العارض يحتاج بايتات الملف نفسها، فمن أراد حفظها من أدوات المتصفح يستطيع.
       هذا قفل للطريق العادي، لا حماية من النسخ. */
    const dest = req.headers.get('sec-fetch-dest')
    if (!inline || (dest && DOC_DEST.has(dest))) return new Response('التنزيل غير متاح لهذا الملف', { status: 403 })
  }
  return serveAsset(a, { inline })
}
