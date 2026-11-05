/* ملف تقويم للدورة (Google / Outlook / Apple) */
import { courseDetail } from '@/server/queries'
import { plain } from '@/motion/kashida'

const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
const esc = (s: string) => s.replace(/[\\,;]/g, (m) => '\\' + m).replace(/\n/g, '\\n')

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const d = await courseDetail((await ctx.params).slug)
  if (!d || !d.course.startsAt) return new Response('Not found', { status: 404 })
  const start = new Date(d.course.startsAt)
  const end = d.row.endsAt ? new Date(d.row.endsAt) : new Date(start.getTime() + Math.max(1, Math.min(d.course.hours || 2, 8)) * 3600e3)
  const url = new URL(`/courses/${d.course.slug}`, req.url).toString()
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NAF Academy//AR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${d.row.id}@naf-academy`, `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
    `SUMMARY:${esc(plain(d.course.title))}`, `DESCRIPTION:${esc(`${d.course.subtitle ?? ''}\n${url}`)}`,
    d.course.city ? `LOCATION:${esc([d.course.city, d.row.venue.split('\n')[0]].filter(Boolean).join(' — '))}` : '',
    `URL:${url}`, 'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:تبدأ الدورة بعد ساعة', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean)
  return new Response(lines.join('\r\n'), {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': `attachment; filename="${d.course.slug}.ics"` },
  })
}
