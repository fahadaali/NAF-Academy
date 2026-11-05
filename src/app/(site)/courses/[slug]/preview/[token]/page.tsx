import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CourseView } from '@/site/CourseView'
import { courseDetail, homeContent } from '@/server/queries'
import { paymentSettings } from '@/server/settings'
import { isPublic } from '@/lib/course-meta'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function Preview({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params
  const d = await courseDetail(slug, token)
  if (!d || d.row.previewToken !== token) notFound()
  const [home, pay] = await Promise.all([homeContent(), paymentSettings()])
  return <CourseView data={d} preview={!isPublic(d.course.status)} corporate={home.sections.some((x) => x.key === 'corporate' && x.visible)} vat={pay.vatRate} />
}
