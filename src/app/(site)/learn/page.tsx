import { and, eq } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { currentLearner } from '@/server/learner-auth'
import { formatDay, formatHijri, formatTime } from '@/lib/dates'
import { modeLabel } from '@/lib/course-meta'
import { plain } from '@/motion/kashida'
import st from '@/site/learn/learn.module.css'

export default async function MyCourses() {
  const me = (await currentLearner())!
  const rows = await db.select({ e: s.enrollments, c: s.courses, tier: s.priceTiers.name }).from(s.enrollments)
    .innerJoin(s.courses, eq(s.courses.id, s.enrollments.courseId)).leftJoin(s.priceTiers, eq(s.priceTiers.id, s.enrollments.tierId))
    .where(and(eq(s.enrollments.learnerId, me.id), eq(s.enrollments.status, 'active')))
  if (!rows.length)
    return <div className={st.empty}><strong>لم تسجّل في دورة بعد.</strong><a className="btn" href="/courses">تصفّح الدورات</a></div>
  const now = Date.now()
  return (
    <div className={st.grid}>
      {rows.sort((a, b) => (a.c.startsAt ?? '9').localeCompare(b.c.startsAt ?? '9')).map(({ e, c, tier }) => (
        <article key={e.id} className={st.course}>
          <span className="eyebrow">{modeLabel[c.mode]}{tier ? ` · ${tier}` : ''}</span>
          <h2>{plain(c.title)}</h2>
          <div className={`${st.meta} num`}>
            {c.startsAt && <span>{formatDay(c.startsAt)} · {formatTime(c.startsAt)} · {formatHijri(c.startsAt)}</span>}
            <span>{c.hours} ساعة</span>
            {c.city && <span>{c.city}</span>}
          </div>
          {c.startsAt && Date.parse(c.startsAt) > now && (
            <div className={`${st.next} num`}>تبدأ بعد {Math.ceil((Date.parse(c.startsAt) - now) / 864e5)} يوماً — ستصلك التذكيرات قبلها</div>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a className="btn ghost" href={`/courses/${c.slug}`}>صفحة الدورة</a>
            {c.startsAt && <a className="btn ghost" href={`/courses/${c.slug}/calendar`}>أضف إلى التقويم</a>}
          </div>
          <p className={st.soon}>الدروس والمشغّل ورابط الجلسات المباشرة تظهر هنا مع إطلاق مساحة التعلّم.</p>
        </article>
      ))}
    </div>
  )
}
