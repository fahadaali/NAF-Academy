/* صورة مشاركة الدورة — عنوانها ونمطها وموعدها بخط ثمانية */
import { ImageResponse } from 'next/og'
import { courseDetail } from '@/server/queries'
import { ogSvg } from '@/server/og'
import { ogBrand } from '@/server/brand'
import { plain } from '@/motion/kashida'
import { modeLabel } from '@/lib/course-meta'
import { formatDay } from '@/lib/dates'
import { eq } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { getObject } from '@/server/storage'
import type { OgCover } from '@/server/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'دورة'
export const revalidate = 3600

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const d = await courseDetail((await params).slug)
  const brand = await ogBrand()
  const title = d ? plain(d.course.title) : brand.name
  const meta = d ? [modeLabel[d.row.mode], d.course.startsAt ? formatDay(d.course.startsAt) : '', d.row.hours ? `${d.row.hours} ساعة` : ''].filter(Boolean).join('، ') : ''
  /* الغلاف: JPEG/PNG كما هو، وWebP/AVIF بتوأمه JPEG — وإلا التصميم بلا غلاف */
  let cover: OgCover | null = null
  if (d?.row.coverId) {
    const [m] = await db.select().from(s.media).where(eq(s.media.id, d.row.coverId))
    const key = m && !m.deletedAt ? (m.mime === 'image/jpeg' || m.mime === 'image/png' ? m.key : m.ogKey) : null
    const bytes = key ? await getObject(key) : null
    if (m && key && bytes) cover = { bytes, mime: key === m.key ? (m.mime as OgCover['mime']) : 'image/jpeg', focalX: m.focalX, focalY: m.focalY }
  }
  const svg = await ogSvg({ kicker: d?.track?.title, title, meta, brand, cover })
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`} width={1200} height={630} alt="" />,
    size,
  )
}
