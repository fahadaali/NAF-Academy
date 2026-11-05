import type { Metadata } from 'next'
import { breadcrumbs, ldJson } from '@/lib/seo'
import { siteUrl } from '@/server/site'
import { notFound } from 'next/navigation'
import { catalog, trackDetail } from '@/server/queries'
import { Catalog } from '@/site/Catalog'
import { PageHero } from '@/site/PageHero'

export const revalidate = 300

export async function generateStaticParams() {
  return (await catalog()).tracks.map((t) => ({ slug: t.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const d = await trackDetail((await params).slug)
  return d ? { title: d.track.title, description: d.track.summary, alternates: { canonical: `/tracks/${d.track.slug}` } } : {}
}

export default async function TrackPage({ params }: { params: Promise<{ slug: string }> }) {
  const d = await trackDetail((await params).slug)
  if (!d) notFound()
  const { track, courses, instructors } = d
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(breadcrumbs(siteUrl() ?? '', [['الرئيسية', '/'], ['المسارات', '/tracks'], [track.title, `/tracks/${track.slug}`]])) }} />
      <PageHero eyebrow={track.kicker} title={track.title} body={track.description || track.summary} glyph={track.glyph} />
      <div className="wrap">
        {courses.length ? <Catalog courses={courses} tracks={[track]} instructors={instructors} initialTrack={track.slug} />
          : <p style={{ padding: '80px 0', textAlign: 'center', color: 'var(--muted)' }}>دورات هذا المسار تُعلَن قريباً.</p>}
      </div>
    </>
  )
}
