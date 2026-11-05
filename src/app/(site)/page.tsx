import type { Metadata } from 'next'
import { Curtain } from '@/components/Curtain'
import { brandView } from '@/server/brand'
import { pick } from '@/lib/brand'
import { ldJson, organization, website } from '@/lib/seo'
import { siteUrl } from '@/server/site'
import { CourseCard } from '@/components/CourseCard'
import { Opening } from '@/scenes/opening/Opening'
import { Ladder } from '@/scenes/ladder/Ladder'
import { TrackShelf } from '@/scenes/shelf/TrackShelf'
import { Timeline } from '@/scenes/timeline/Timeline'
import { Instructors } from '@/scenes/people/Instructors'
import { Impact } from '@/scenes/impact/Impact'
import { Corporate } from '@/scenes/corporate/Corporate'
import { Voices } from '@/scenes/voices/Voices'
import { Partners } from '@/scenes/partners/Partners'
import { Faq } from '@/scenes/faq/Faq'
import type { SceneKey } from '@/content/home-defaults'
import { catalog, homeContent, mediaViews } from '@/server/queries'
import { pagesContent } from '@/server/queries'

/* تُعاد عند كل حفظ في اللوحة، وكل خمس دقائق لما يتغيّر بالوقت (نشر مجدول، انتهاء عرض) */
export const revalidate = 300

/** وصف الرئيسية في نتائج البحث — من «الصفحات العامة»، وإلا وصف الموقع العام */
export async function generateMetadata(): Promise<Metadata> {
  const p = await pagesContent()
  return p.home.seoDescription ? { description: p.home.seoDescription } : {}
}

export default async function Home() {
  const [home, { tracks, courses, instructors }, brand] = await Promise.all([homeContent(), catalog(), brandView()])
  const trackOf = (slug: string) => tracks.find((t) => t.slug === slug)
  /* صور الآراء وشعارات الشركاء بمعرّفاتها */
  const pics = await mediaViews([...home.voices.map((v) => v.photoId), ...home.partners.map((x) => x.logoId)])
  const instructorOf = (slug: string) => instructors.find((i) => i.slug === slug)
  /* «دورة مميزة» تتقدّم في الرئيسية (كما يَعِد المحرّر)، ثم الترتيب العام */
  const upcoming = [...courses.filter((c) => c.featured), ...courses.filter((c) => !c.featured)].slice(0, 10)

  const scenes: Record<SceneKey, React.ReactNode> = {
    ladder: <Ladder {...home.ladder} eyebrow={home.heads.ladder.eyebrow} />,
    tracks: <TrackShelf tracks={tracks} head={home.heads.tracks} />,
    courses: (
      <Timeline count={courses.length} head={home.heads.courses}>
        {upcoming.map((c) => (
          <CourseCard key={c.slug} course={c} track={trackOf(c.track)} instructor={instructorOf(c.instructor)} />
        ))}
      </Timeline>
    ),
    instructors: <Instructors people={instructors} head={home.heads.instructors} />,
    impact: <Impact stats={home.stats} />,
    voices: <Voices head={home.heads.voices} items={home.voices} photos={pics} />,
    partners: <Partners head={home.heads.partners} items={home.partners} logos={pics} />,
    faq: <Faq head={home.heads.faq} items={home.faq} />,
    corporate: <Corporate {...home.corporate} eyebrow={home.heads.corporate.eyebrow} />,
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson([organization(siteUrl() ?? '', { name: brand.name, companyName: brand.companyName, logo: (brand.academy.light ?? brand.academy.dark)?.url }), website(siteUrl() ?? '', brand.name)]) }} />
      <Curtain />
      <Opening {...home.hero} logo={pick(brand.mark, 'dark')} logoAlt={brand.name} />
      {home.sections.filter((x) => x.visible).map((x) => (
        <div key={x.key} style={{ display: 'contents' }}>{scenes[x.key]}</div>
      ))}
    </>
  )
}
