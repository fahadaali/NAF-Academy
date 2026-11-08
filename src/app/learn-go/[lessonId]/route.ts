/* الانضمام للجلسة المباشرة — الرابط الحقيقي لا يظهر في الصفحة؛ يُكشف هنا فقط للمسجّل داخل النافذة وقد فُتح له الدرس،
   ويُسجَّل حضوره. يبقى GET (زر «انضم الآن» رابط عادي)، لكن الحضور لا يُحتسب من جلب مسبق للمتصفح (prefetch) ولا من
   روبوتات معاينة الروابط ولا من طلب ليس تنقّلاً — فتح الرابط فعلاً هو الحضور. */
import { NextResponse } from 'next/server'
import { onProgress } from '@/server/notify/engine'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { currentLearner } from '@/server/learner-auth'
import { learnerCourse } from '@/server/learning'
import { joinWindow } from '@/lib/learning'

export const dynamic = 'force-dynamic'

/** روبوتات معاينة الروابط الشائعة (المحادثات والشبكات ومحركات البحث) — بأسمائها لا بكلمة «bot» العامة (أجهزة مثل CUBOT) */
const PREVIEW_BOT = /slackbot|twitterbot|facebookexternalhit|facebot|linkedinbot|whatsapp\/|telegrambot|discordbot|skypeuripreview|googlebot|bingbot|applebot|yandexbot|duckduckbot|redditbot|pinterestbot|embedly|iframely|google-pagerenderer|mastodon\//i

/** طلب لا يمثّل فتح المتدرب للرابط: جلب مسبق، أو روبوت معاينة، أو جلب ليس تنقّلاً (حين يرسل المتصفح Sec-Fetch-Mode) */
function notAVisit(req: Request) {
  const h = req.headers
  const purpose = `${h.get('sec-purpose') ?? ''} ${h.get('purpose') ?? ''} ${h.get('x-moz') ?? ''}`
  if (/prefetch|prerender/i.test(purpose)) return 'prefetch'
  if (PREVIEW_BOT.test(h.get('user-agent') ?? '')) return 'bot'
  const mode = h.get('sec-fetch-mode')
  if (mode && mode !== 'navigate') return 'bot'
  return null
}

export async function GET(req: Request, ctx: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await ctx.params
  const skip = notAVisit(req)
  /* الجلب المسبق لا يُخزَّن فيُستعمل بدل التنقّل الحقيقي — ولا يُكشف فيه الرابط */
  if (skip === 'prefetch') return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
  const me = await currentLearner()
  if (!me) return NextResponse.redirect(new URL(`/login?next=/learn`, req.url), 303)
  const [row] = await db.select({ slug: s.courses.slug }).from(s.lessons)
    .innerJoin(s.modules, eq(s.modules.id, s.lessons.moduleId)).innerJoin(s.courses, eq(s.courses.id, s.modules.courseId))
    /* دورة في المحذوفات لا تُفتح جلساتها */
    .where(and(eq(s.lessons.id, lessonId), isNull(s.courses.deletedAt)))
  if (!row) return new Response('غير متاح', { status: 404 })
  const back = new URL(`/learn/${row.slug}/${lessonId}`, req.url)
  /* الدرس بمواعيد دفعة المتدرب، وإتاحته له بالقاعدة نفسها في صفحة الدرس (التسجيل الساري، والفتح المتدرّج) */
  const c = await learnerCourse(row.slug, me)
  const l = c?.ordered.find((x) => x.id === lessonId)
  if (!c || !l || l.type !== 'live') return new Response('غير متاح', { status: 404 })
  const access = c.modules.flatMap((m) => m.lessons).find((x) => x.id === lessonId)?.access
  if (!c.enrollment || access?.state !== 'open') return NextResponse.redirect(back, 303)
  if (!l.joinUrl) return new Response('غير متاح', { status: 404 })
  if (joinWindow(l.startsAt, l.endsAt).state !== 'open') return NextResponse.redirect(back, 303)
  if (skip) return NextResponse.redirect(back, 303)
  const first = await db.insert(s.attendance).values({ learnerId: me.id, lessonId, courseId: c.course.id, method: 'join', by: 'self' }).onConflictDoNothing().returning({ at: s.attendance.at })
  if (first.length) await onProgress(me.id, c.course.id)
  return NextResponse.redirect(l.joinUrl, 303)
}
