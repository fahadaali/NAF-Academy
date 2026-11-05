/* صورة مشاركة الدورة — عنوانها ونمطها وموعدها بخط ثمانية */
import { ImageResponse } from 'next/og'
import { courseDetail } from '@/server/queries'
import { ogSvg } from '@/server/og'
import { plain } from '@/motion/kashida'
import { modeLabel } from '@/lib/course-meta'
import { formatDay } from '@/lib/dates'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'أكاديمية ناف — دورة'
export const revalidate = 3600

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const d = await courseDetail((await params).slug)
  const title = d ? plain(d.course.title) : 'أكاديمية ناف'
  const meta = d ? [modeLabel[d.row.mode], d.row.startsAt ? formatDay(d.row.startsAt) : '', d.row.hours ? `${d.row.hours} ساعة` : ''].filter(Boolean).join('، ') : ''
  const svg = await ogSvg({ kicker: d?.track?.title, title, meta })
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`} width={1200} height={630} alt="" />,
    size,
  )
}
