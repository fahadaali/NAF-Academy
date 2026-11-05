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
import { and, eq } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { evaluate } from '@/server/certificates'
import { ReviewBox } from '@/site/learn/ReviewBox'
import { REVIEW_MIN_PCT } from '@/lib/reviews'
import st from '@/site/learn/course.module.css'
import { ANON_DISPLAY } from '@/lib/reviews'

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
  const [cert, [issued], [myReview]] = await Promise.all([
    evaluate(me.id, course.id),
    db.select().from(s.certificates).where(and(eq(s.certificates.learnerId, me.id), eq(s.certificates.courseId, course.id))),
    db.select().from(s.reviews).where(and(eq(s.reviews.learnerId, me.id), eq(s.reviews.courseId, course.id))),
  ])
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
          {cert && cert.rules.enabled && (
            <section className={st.box} aria-labelledby="cert-h">
              <h2 id="cert-h">الشهادة</h2>
              {issued?.status === 'issued' ? (
                <p className={st.certDone}>✓ صدرت شهادتك — <a href={`/certificates/${issued.code}`}>عرضها وتنزيلها</a></p>
              ) : issued?.status === 'pending' ? (
                <p className={st.certWait}>استوفيت الشروط — بانتظار اعتماد الأكاديمية.</p>
              ) : (
                <ul className={st.criteria} role="list">
                  {cert.criteria.map((c) => <li key={c.key} data-met={c.met ? '1' : '0'}><span aria-hidden="true">{c.met ? '✓' : '○'}</span>{c.label}<small className="num">{c.detail}</small></li>)}
                </ul>
              )}
            </section>
          )}
          {pct >= REVIEW_MIN_PCT && (
            <section className={st.box} aria-labelledby="rev-h">
              <h2 id="rev-h">قيّم الدورة</h2>
              <ReviewBox courseId={course.id} initial={myReview ? { rating: myReview.rating, comment: myReview.comment, status: myReview.status, anonymous: myReview.display === ANON_DISPLAY } : null} />
            </section>
          )}
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
