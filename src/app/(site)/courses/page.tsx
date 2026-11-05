import type { Metadata } from 'next'
import { catalog } from '@/server/queries'
import { Catalog } from '@/site/Catalog'
import { PageHero } from '@/site/PageHero'

export const revalidate = 300
export const metadata: Metadata = { title: 'الدورات', description: 'دورات قانونية متخصصة: مباشرة وحضورية ومسجّلة، من الممارسة إلى الخبرة.' }

export default async function Courses() {
  const { courses, tracks, instructors } = await catalog()
  return (
    <>
      <PageHero eyebrow="الدورات" title="كل دورة درج~3ة في سُلّمك." body="اختر بالمسار أو النمط أو الدرجة — والدورات المنتهية تبقى ظاهرة لتُبلَّغ بدفعتها القادمة." />
      <div className="wrap"><Catalog courses={courses} tracks={tracks} instructors={instructors} /></div>
    </>
  )
}
