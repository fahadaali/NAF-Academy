import type { Metadata } from 'next'
import { catalog, pagesContent } from '@/server/queries'
import { Catalog } from '@/site/Catalog'
import { PageHero } from '@/site/PageHero'

export const revalidate = 300
export async function generateMetadata(): Promise<Metadata> {
  const { courses: c } = await pagesContent()
  return { title: c.eyebrow || 'الدورات', description: c.seoDescription || undefined }
}

export default async function Courses() {
  const [{ courses, tracks, instructors }, { courses: head }] = await Promise.all([catalog(), pagesContent()])
  return (
    <>
      <PageHero eyebrow={head.eyebrow} title={head.title} body={head.body || undefined} />
      <div className="wrap"><Catalog courses={courses} tracks={tracks} instructors={instructors} /></div>
    </>
  )
}
