import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CourseView } from '@/site/CourseView'
import { courseDetail, homeContent, mediaViews } from '@/server/queries'
import { courseDraft } from '@/server/drafts'
import { blocksFrom, blocksText } from '@/lib/blocks'
import { paymentSettings } from '@/server/settings'
import { isPublic } from '@/lib/course-meta'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function Preview({ params, searchParams }: { params: Promise<{ slug: string; token: string }>; searchParams: Promise<{ draft?: string }> }) {
  const { slug, token } = await params
  const found = await courseDetail(slug, token)
  if (!found || found.row.previewToken !== token) notFound()
  let d = found
  /* «معاينة كاملة» من المحرّر: ما كُتب ولم يُحفظ بعد */
  const dr = (await searchParams).draft ? await courseDraft(found.row.id) : null
  if (dr) {
    const blocks = dr.content ?? blocksFrom(found.row.description)
    const views = await mediaViews([dr.coverId, ...blocks.map((b) => (b.t === 'img' ? b.mediaId : null))])
    d = {
      ...found,
      course: { ...found.course, title: dr.title || found.course.title, subtitle: dr.subtitle, cover: dr.coverId ? views.get(dr.coverId) : undefined },
      row: { ...found.row, outcomes: dr.outcomes.filter(Boolean), audience: dr.audience.filter(Boolean), requirements: dr.requirements.filter(Boolean), faq: dr.faq.filter((f) => f.q && f.a), description: dr.content ? blocksText(dr.content) : found.row.description },
      blocks, blockMedia: views,
    }
  }
  const [home, pay] = await Promise.all([homeContent(), paymentSettings()])
  return <CourseView data={d} preview={!isPublic(d.course.status)} corporate={home.sections.some((x) => x.key === 'corporate' && x.visible)} vat={pay.vatRate} />
}
