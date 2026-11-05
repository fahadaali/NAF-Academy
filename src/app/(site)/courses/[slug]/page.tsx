import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CourseView } from '@/site/CourseView'
import { catalog, courseDetail } from '@/server/queries'
import { plain } from '@/motion/kashida'

export const revalidate = 300

export async function generateStaticParams() {
  const { courses } = await catalog()
  return courses.map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const d = await courseDetail((await params).slug)
  if (!d) return {}
  const title = d.row.seoTitle || plain(d.course.title)
  const description = d.row.seoDescription || d.course.subtitle || undefined
  return { title, description, openGraph: { title, description, images: d.course.cover ? [d.course.cover.url] : undefined } }
}

export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const d = await courseDetail((await params).slug)
  if (!d) notFound()
  const ld = {
    '@context': 'https://schema.org', '@type': 'Course', name: plain(d.course.title), description: d.course.subtitle,
    provider: { '@type': 'Organization', name: 'أكاديمية ناف' }, inLanguage: 'ar',
    offers: { '@type': 'Offer', price: (d.course.pricing.amount / 100).toFixed(2), priceCurrency: 'SAR' },
  }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      <CourseView data={d} />
    </>
  )
}
