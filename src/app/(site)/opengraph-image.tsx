/* صورة المشاركة العامة للموقع — من محتوى الرئيسية في اللوحة */
import { ImageResponse } from 'next/og'
import { ogSvg } from '@/server/og'
import { homeContent } from '@/server/queries'
import { plain } from '@/motion/kashida'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'أكاديمية ناف'
export const revalidate = 3600

export default async function Image() {
  const h = await homeContent()
  const svg = await ogSvg({ kicker: plain(h.hero.eyebrow), title: plain(h.hero.lines.join(' ')), meta: plain(h.footer.title) })
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`} width={1200} height={630} alt="" />,
    size,
  )
}
