import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { catalog, instructorDetail } from '@/server/queries'
import { CourseCard } from '@/components/CourseCard'
import { Picture } from '@/components/Picture'
import { Prose } from '@/components/Prose'
import { PageHero } from '@/site/PageHero'

export const revalidate = 300

export async function generateStaticParams() {
  return (await catalog()).instructors.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const d = await instructorDetail((await params).slug)
  return d ? { title: d.person.name, description: d.person.title } : {}
}

export default async function InstructorPage({ params }: { params: Promise<{ slug: string }> }) {
  const d = await instructorDetail((await params).slug)
  if (!d) notFound()
  const { person: p, courses, tracks, instructors } = d
  return (
    <>
      <PageHero eyebrow={p.title} title={p.name}>
        {p.links && p.links.length > 0 && (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {p.links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" style={{ color: 'var(--gold-4)', fontWeight: 600 }}>{l.label} ↗</a>)}
          </div>
        )}
      </PageHero>
      <div className="wrap" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 50, paddingBlock: '60px 100px', alignItems: 'start' }}>
        <div style={{ position: 'relative', aspectRatio: '4 / 4.6', borderRadius: 'var(--radius-l)', overflow: 'hidden', background: 'radial-gradient(70% 60% at 50% 40%, var(--night-3), var(--night-1))', maxInlineSize: 420, display: 'grid', placeItems: 'center', color: 'var(--gold-3)', fontFamily: 'var(--font-display)', fontSize: 120 }}>
          {p.photo ? <Picture media={p.photo} priority /> : p.name.slice(0, 1)}
        </div>
        <div style={{ display: 'grid', gap: 22 }}>
          {p.bio && <Prose text={p.bio} />}
          {p.highlights.length > 0 && (
            <ul role="list" style={{ display: 'grid', gap: 10 }}>
              {p.highlights.map((h) => <li key={h} style={{ padding: '14px 18px', borderRadius: 'var(--radius-m)', background: 'var(--surface)', border: '1px solid var(--line)', fontWeight: 600 }}>{h}</li>)}
            </ul>
          )}
        </div>
      </div>
      {courses.length > 0 && (
        <section style={{ background: 'var(--surface-2)', paddingBlock: '60px 100px' }}>
          <div className="wrap">
            <h2 className="scene-title" style={{ marginBlockEnd: 26 }}>دورات {p.name}</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22 }}>
              {courses.map((c) => <CourseCard key={c.slug} course={c} track={tracks.find((t) => t.slug === c.track)} instructor={instructors.find((x) => x.slug === c.instructor)} />)}
            </div>
          </div>
        </section>
      )}
    </>
  )
}
