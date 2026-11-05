import type { Metadata } from 'next'
import { brandView } from '@/server/brand'
import { notFound } from 'next/navigation'
import { CourseView } from '@/site/CourseView'
import { catalog, courseDetail, homeContent } from '@/server/queries'
import { paymentSettings } from '@/server/settings'
import { plain } from '@/motion/kashida'
import { breadcrumbs, course, ldJson } from '@/lib/seo'
import { siteUrl } from '@/server/site'

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
  return { title, description, alternates: { canonical: `/courses/${d.row.slug}` }, openGraph: { title, description, type: 'website', url: `/courses/${d.row.slug}` }, twitter: { card: 'summary_large_image', title, description } }
}

export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const d = await courseDetail((await params).slug)
  if (!d) notFound()
  const site = siteUrl() ?? ''
  const r = d.row
  const [home, pay] = await Promise.all([homeContent(), paymentSettings()])
  const ld = [
    course(site, {
      slug: r.slug, title: plain(d.course.title), description: r.seoDescription || d.course.subtitle || '', image: d.course.cover ? `${site}${d.course.cover.url}` : undefined,
      mode: r.mode, hours: r.hours, startsAt: r.startsAt, endsAt: r.endsAt, city: r.city, venue: r.venue,
      price: d.tiers.length ? Math.min(...d.tiers.map((t) => t.price)) : d.course.pricing.amount, free: r.free, saleEndsAt: r.saleEndsAt,
      available: d.course.status === 'open', instructors: d.instructors.map((p) => ({ name: p.name, slug: p.slug })),
      rating: d.reviews.count ? { avg: d.reviews.avg, count: d.reviews.count } : undefined, org: (await brandView()).name,
    }),
    breadcrumbs(site, [['الرئيسية', '/'], ['الدورات', '/courses'], ...(d.track ? [[d.track.title, `/tracks/${d.track.slug}`] as [string, string]] : []), [plain(d.course.title), `/courses/${r.slug}`]]),
  ]
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(ld) }} />
      <CourseView data={d} corporate={home.sections.some((x) => x.key === 'corporate' && x.visible)} vat={pay.vatRate} />
    </>
  )
}
