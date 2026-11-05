import type { Metadata } from 'next'
import { breadcrumbs, ldJson, person } from '@/lib/seo'
import { siteUrl } from '@/server/site'
import { notFound } from 'next/navigation'
import { catalog, instructorDetail } from '@/server/queries'
import { CourseCard } from '@/components/CourseCard'
import { Picture } from '@/components/Picture'
import { Prose } from '@/components/Prose'
import { PageHero } from '@/site/PageHero'
import pg from '@/site/pages.module.css'

export const revalidate = 300

export async function generateStaticParams() {
  return (await catalog()).instructors.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const d = await instructorDetail((await params).slug)
  return d ? { title: d.person.name, description: d.person.title, alternates: { canonical: `/instructors/${d.person.slug}` } } : {}
}

export default async function InstructorPage({ params }: { params: Promise<{ slug: string }> }) {
  const d = await instructorDetail((await params).slug)
  if (!d) notFound()
  const { person: p, courses, tracks, instructors } = d
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson([person(siteUrl() ?? '', { slug: p.slug, name: p.name, title: p.title, image: p.photo ? `${siteUrl() ?? ''}${p.photo.url}` : undefined }), breadcrumbs(siteUrl() ?? '', [['الرئيسية', '/'], [p.name, `/instructors/${p.slug}`]])]) }} />
      <PageHero eyebrow={p.title} title={p.name}>
        {p.links && p.links.length > 0 && (
          <div className={pg.links}>
            {p.links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer">{l.label} ↗</a>)}
          </div>
        )}
      </PageHero>
      <div className={`wrap ${pg.person}`}>
        <div className={pg.portrait}>
          {p.scene ?? p.photo ? <Picture media={(p.scene ?? p.photo)!} priority /> : p.name.slice(0, 1)}
        </div>
        <div className={pg.about}>
          {p.bio && <Prose text={p.bio} />}
          {p.highlights.length > 0 && (
            <ul role="list" className={pg.highlights}>
              {p.highlights.map((h) => <li key={h}>{h}</li>)}
            </ul>
          )}
        </div>
      </div>
      {courses.length > 0 && (
        <section className={pg.courses}>
          <div className="wrap">
            <h2 className="scene-title">دورات {p.name}</h2>
            <div className={`stagger reveal ${pg.cards}`}>
              {courses.map((c) => <CourseCard key={c.slug} course={c} track={tracks.find((t) => t.slug === c.track)} instructor={instructors.find((x) => x.slug === c.instructor)} />)}
            </div>
          </div>
        </section>
      )}
    </>
  )
}
