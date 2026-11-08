/* ملف تقويم للدورة (Google / Outlook / Apple): حدث لكل جلسة مجدولة (مباشرة أو حضورية)،
   وإن لم تكن للدورة جلسات فحدث واحد بموعدها. يُتاح للعموم ما دامت الدورة عامة ظاهرة (أو برمز معاينتها)، وللمسجّل فيها دائماً. */
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { currentLearner } from '@/server/learner-auth'
import { isPublic, liveStatus } from '@/lib/course-meta'
import { plain } from '@/motion/kashida'
import { inList } from '@/server/db/limits'
import { hasAccess, withSession } from '@/lib/cohorts'
import { sessionsOf } from '@/server/cohorts'

const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
const esc = (t: string) => t.replace(/[\\,;]/g, (m) => '\\' + m).replace(/\n/g, '\\n')
const H = 3600e3

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const [c] = await db.select().from(s.courses).where(and(eq(s.courses.slug, (await ctx.params).slug), isNull(s.courses.deletedAt)))
  if (!c) return new Response('Not found', { status: 404 })
  /* للعموم: الدورة العامة الظاهرة (كصفحتها)، أو حامل رمز معاينتها؛ والبرنامج الخاص لمسجّليه وحدهم */
  const t = new URL(req.url).searchParams.get('t')
  const shown = (c.visibility === 'public' && isPublic(liveStatus(c.status, c.publishAt))) || (!!t && t === c.previewToken)
  if (!shown) {
    const me = await currentLearner()
    const [en] = me ? await db.select().from(s.enrollments).where(and(eq(s.enrollments.courseId, c.id), eq(s.enrollments.learnerId, me.id), eq(s.enrollments.status, 'active'))) : []
    if (!hasAccess(en)) return new Response('Not found', { status: 404 })
  }
  const mods = await db.select({ id: s.modules.id }).from(s.modules).where(eq(s.modules.courseId, c.id))
  /* مواعيد الدفعة: دفعة المسجّل، أو المطلوبة في الرابط (?cohort=) لزائر صفحة الدورة */
  const me = await currentLearner()
  const [mine] = me ? await db.select({ cohortId: s.enrollments.cohortId }).from(s.enrollments).where(and(eq(s.enrollments.courseId, c.id), eq(s.enrollments.learnerId, me.id), eq(s.enrollments.status, 'active'))) : []
  const asked = new URL(req.url).searchParams.get('cohort')
  const [k] = asked && !mine?.cohortId ? await db.select({ id: s.cohorts.id }).from(s.cohorts).where(and(eq(s.cohorts.id, asked), eq(s.cohorts.courseId, c.id), isNull(s.cohorts.deletedAt))) : []
  const cohortId = mine?.cohortId ?? k?.id ?? null
  const per = await sessionsOf(cohortId)
  const sessions = mods.length
    ? (await db.select().from(s.lessons).where(and(inList(s.lessons.moduleId, mods.map((m) => m.id)), inArray(s.lessons.type, ['live', 'onsite']))))
        .map((l) => withSession(l, per)).filter((l) => l.startsAt).sort((a, b) => a.startsAt!.localeCompare(b.startsAt!))
    : []
  const title = plain(c.title)
  const page = new URL(`/courses/${c.slug}`, req.url).toString()
  /* مكان الدفعة إن كان لها مكان، وإلا مكان الدورة */
  const [kc] = cohortId ? await db.select({ city: s.cohorts.city, venue: s.cohorts.venue }).from(s.cohorts).where(eq(s.cohorts.id, cohortId)) : []
  const place = [kc?.city || c.city, (kc?.venue || c.venue).split('\n')[0]].filter(Boolean).join(' — ')
  const event = (uid: string, start: Date, end: Date, summary: string, url: string, location: string, alarm: string) => [
    'BEGIN:VEVENT', `UID:${uid}@naf-academy`, `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
    `SUMMARY:${esc(summary)}`, `DESCRIPTION:${esc(`${c.subtitle ?? ''}\n${url}`)}`, location ? `LOCATION:${esc(location)}` : '',
    `URL:${url}`, 'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', `DESCRIPTION:${esc(alarm)}`, 'END:VALARM', 'END:VEVENT',
  ]
  const events = sessions.length
    ? sessions.flatMap((l) => {
        const start = new Date(l.startsAt!)
        const end = l.endsAt ? new Date(l.endsAt) : new Date(start.getTime() + 2 * H)
        const where = l.type === 'onsite' ? l.location.split('\n')[0] || place : 'عن بُعد'
        return event(l.id, start, end, `${title} — ${l.title}`, new URL(`/learn/${c.slug}/${l.id}`, req.url).toString(), where, 'تبدأ الجلسة بعد ساعة')
      })
    : c.startsAt
      ? event(c.id, new Date(c.startsAt), c.endsAt ? new Date(c.endsAt) : new Date(Date.parse(c.startsAt) + Math.max(1, Math.min(c.hours || 2, 8)) * H), title, page, place, 'تبدأ الدورة بعد ساعة')
      : null
  if (!events) return new Response('Not found', { status: 404 })
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NAF Academy//AR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(title)}`, ...events, 'END:VCALENDAR'].filter(Boolean)
  return new Response(lines.join('\r\n'), {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': `attachment; filename="${c.slug}.ics"`, 'cache-control': 'private, no-store' },
  })
}
