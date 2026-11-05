import { Curtain } from '@/components/Curtain'
import { CourseCard } from '@/components/CourseCard'
import { Opening } from '@/scenes/opening/Opening'
import { Ladder } from '@/scenes/ladder/Ladder'
import { TrackShelf } from '@/scenes/shelf/TrackShelf'
import { Timeline } from '@/scenes/timeline/Timeline'
import { Instructors } from '@/scenes/people/Instructors'
import { Impact } from '@/scenes/impact/Impact'
import { Corporate } from '@/scenes/corporate/Corporate'
import type { SceneKey } from '@/content/home-defaults'
import { catalog, homeContent } from '@/server/queries'

/* تُعاد عند كل حفظ في اللوحة، وكل خمس دقائق لما يتغيّر بالوقت (نشر مجدول، انتهاء عرض) */
export const revalidate = 300

export default async function Home() {
  const [home, { tracks, courses, instructors }] = await Promise.all([homeContent(), catalog()])
  const trackOf = (slug: string) => tracks.find((t) => t.slug === slug)
  const instructorOf = (slug: string) => instructors.find((i) => i.slug === slug)
  const upcoming = courses.slice(0, 10)

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
    corporate: <Corporate {...home.corporate} eyebrow={home.heads.corporate.eyebrow} />,
  }

  return (
    <>
      <Curtain />
      <Opening {...home.hero} />
      {home.sections.filter((x) => x.visible).map((x) => (
        <div key={x.key} style={{ display: 'contents' }}>{scenes[x.key]}</div>
      ))}
    </>
  )
}
