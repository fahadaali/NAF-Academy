import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CourseView } from '@/site/CourseView'
import { courseDetail } from '@/server/queries'
import { isPublic } from '@/lib/course-meta'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function Preview({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params
  const d = await courseDetail(slug, token)
  if (!d || d.row.previewToken !== token) notFound()
  return <CourseView data={d} preview={!isPublic(d.course.status)} />
}
