import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { currentLearner } from '@/server/learner-auth'
import { learnerCourse } from '@/server/learning'
import { Outline, Ring } from '@/site/learn/Outline'
import { formatDay, formatHijri, formatTime } from '@/lib/dates'
import { joinWindow } from '@/lib/learning'
import { modeLabel } from '@/lib/course-meta'
import { plain } from '@/motion/kashida'
import { Words } from '@/components/Words'
import st from '@/site/learn/course.module.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false } }

export default async function CourseHome({ params }: { params: Promise<{ course: string }> }) {
  const { course: slug } = await params
  const me = await currentLearner()
  if (!me) redirect(`/login?next=/learn/${slug}`)
  const ctx = await learnerCourse(slug, me)
  if (!ctx) notFound()
  if (!ctx.enrollment) redirect(`/courses/${slug}`)
  const { course, modules, pct, resumeId, upcoming } = ctx
  return (
    <>
      <header className={st.hero} data-surface="night">
        <div className={`wrap ${st.heroIn}`}>
          <div>
            <a href="/learn" className={st.back}>← دوراتي</a>
            <span className="eyebrow" style={{ color: 'var(--gold-4)' }}>{modeLabel[course.mode]}</span>
            <Words as="h1" text={plain(course.title)} className={st.title} />
          </div>
          <div className={st.ringBox}>
            <Ring pct={pct} size={120} />
            {resumeId && <a className="btn" href={`/learn/${slug}/${resumeId}`}>{pct ? 'تابع من حيث توقفت' : 'ابدأ التعلّم'}</a>}
          </div>
        </div>
      </header>
      <div className={`wrap ${st.body}`}>
        <div className={st.main}>
          {upcoming.length > 0 && (
            <section className={st.box}>
              <h2>الجلسات القادمة</h2>
              {upcoming.map((l) => {
                const j = joinWindow(l.startsAt, l.endsAt)
                return (
                  <a key={l.id} href={`/learn/${slug}/${l.id}`} className={st.session}>
                    <span className={st.sType}>{l.type === 'live' ? 'مباشرة' : 'حضورية'}</span>
                    <span><strong>{l.title}</strong><small className="num">{formatDay(l.startsAt!)} · {formatTime(l.startsAt!)} · {formatHijri(l.startsAt!)}</small></span>
                    {j.state === 'open' && <span className={st.live}>{l.type === 'live' ? 'انضم الآن' : 'جارية الآن'}</span>}
                  </a>
                )
              })}
            </section>
          )}
          <section className={st.box}>
            <h2>المنهج</h2>
            <Outline slug={slug} modules={modules} />
          </section>
        </div>
      </div>
    </>
  )
}
