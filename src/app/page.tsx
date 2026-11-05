import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { Curtain } from '@/components/Curtain'
import { MotionRoot } from '@/components/MotionRoot'
import { CourseCard } from '@/components/CourseCard'
import { Opening } from '@/scenes/opening/Opening'
import { Ladder } from '@/scenes/ladder/Ladder'
import { TrackShelf } from '@/scenes/shelf/TrackShelf'
import { Timeline } from '@/scenes/timeline/Timeline'
import { Instructors } from '@/scenes/people/Instructors'
import { Impact } from '@/scenes/impact/Impact'
import { Corporate } from '@/scenes/corporate/Corporate'
import { corporate, courses, hero, instructors, ladder, nav, stats, tracks } from '@/content/seed'
import { isPublic } from '@/lib/course-meta'

export default function Home() {
  const visible = courses.filter((c) => isPublic(c.status))
  const trackOf = (slug: string) => tracks.find((t) => t.slug === slug)
  const instructorOf = (slug: string) => instructors.find((i) => i.slug === slug)
  return (
    <>
      <Curtain />
      <MotionRoot />
      <Header nav={nav} />
      <main id="main">
        <Opening {...hero} />
        <Ladder {...ladder} />
        <TrackShelf tracks={tracks} />
        <Timeline count={visible.length}>
          {visible.map((c) => (
            <CourseCard key={c.slug} course={c} track={trackOf(c.track)} instructor={instructorOf(c.instructor)} />
          ))}
        </Timeline>
        <Instructors people={instructors} />
        <Impact stats={stats} />
        <Corporate {...corporate} />
      </main>
      <Footer />
    </>
  )
}
