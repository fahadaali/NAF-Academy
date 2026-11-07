import { and, eq, isNull } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { currentLearner } from '@/server/learner-auth'
import { formatDay, formatHijri, formatTime } from '@/lib/dates'
import { modeLabel } from '@/lib/course-meta'
import { plain } from '@/motion/kashida'
import { learnerCourse } from '@/server/learning'
import { Ring } from '@/site/learn/Outline'
import st from '@/site/learn/learn.module.css'
import { JoinPanel } from '@/site/learn/LessonParts'
import { joinWindow } from '@/lib/learning'
import { hasAccess } from '@/lib/cohorts'
import { Achievements } from '@/site/learn/Achievements'
import { learnerAchievements } from '@/server/achievements'

export default async function MyCourses() {
  const me = (await currentLearner())!
  const rows = await db.select({ e: s.enrollments, c: s.courses, tier: s.priceTiers.name }).from(s.enrollments)
    .innerJoin(s.courses, eq(s.courses.id, s.enrollments.courseId)).leftJoin(s.priceTiers, eq(s.priceTiers.id, s.enrollments.tierId))
    .where(and(eq(s.enrollments.learnerId, me.id), eq(s.enrollments.status, 'active'), isNull(s.courses.deletedAt)))
  if (!rows.length)
    return <div className={st.empty}><strong>لم تسجّل في دورة بعد.</strong><a className="btn" href="/courses">تصفّح الدورات</a></div>
  const now = Date.now()
  const prog = new Map(await Promise.all(rows.map(async ({ c }) => { const x = await learnerCourse(c.slug, me); return [c.id, { pct: x?.pct ?? 0, resume: x?.resumeId ?? null, next: x?.upcoming[0] ?? null, cohort: x?.cohort ?? null }] as const })))
  const badges = await learnerAchievements(me.id)
  return (
    <>
    <Achievements items={badges} />
    <div className={st.grid}>
      {rows.sort((a, b) => (prog.get(a.c.id)!.cohort?.startsAt ?? a.c.startsAt ?? '9').localeCompare(prog.get(b.c.id)!.cohort?.startsAt ?? b.c.startsAt ?? '9')).map(({ e, c: course, tier }) => {
        const p = prog.get(course.id)!
        /* بدفعة: موعدها ومدينتها */
        const c = { ...course, startsAt: p.cohort?.startsAt ?? course.startsAt, city: p.cohort?.city || course.city }
        const next = p.next
        const jw = next ? joinWindow(next.startsAt, next.endsAt) : null
        const open = hasAccess(e)
        return (
        <article key={e.id} className={st.course} data-expired={open ? '0' : '1'}>
          <div className={st.courseHead}>
            <div><span className="eyebrow">{modeLabel[c.mode]}{tier ? ` · ${tier}` : ''}{p.cohort ? ` · ${p.cohort.title}` : ''}</span><h2>{plain(c.title)}</h2></div>
            <Ring pct={p.pct} size={72} />
          </div>
          <div className={`${st.meta} num`}>
            {c.startsAt && <span>{formatDay(c.startsAt)} · {formatTime(c.startsAt)} · {formatHijri(c.startsAt)}</span>}
            <span>{c.hours} ساعة</span>
            {c.city && <span>{c.city}</span>}
          </div>
          {c.startsAt && Date.parse(c.startsAt) > now && (
            <div className={`${st.next} num`}>تبدأ بعد {Math.ceil((Date.parse(c.startsAt) - now) / 864e5)} يوماً — ستصلك التذكيرات قبلها</div>
          )}
          {!open && <div className={`${st.next} num`}>انتهى الوصول في {formatDay(e.accessUntil!)} — تقدّمك محفوظ</div>}
          {open && next && jw && (next.type === 'live'
            ? <JoinPanel compact lessonId={next.id} title={`${next.title} — ${formatDay(next.startsAt!)} · ${formatTime(next.startsAt!)}`} startsAt={next.startsAt} opensAt={jw.state === 'upcoming' ? jw.opensAt : null} state={jw.state} />
            : <div className={`${st.next} num`}>الجلسة الحضورية القادمة: {next.title} — {formatDay(next.startsAt!)} · {formatTime(next.startsAt!)}</div>)}
          {open && e.accessUntil && <div className={`${st.meta} num`}><span>الوصول حتى {formatDay(e.accessUntil)}</span></div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {open
              ? <a className="btn" href={p.resume ? `/learn/${c.slug}/${p.resume}` : `/learn/${c.slug}`}>{p.pct ? 'تابع التعلّم' : 'ابدأ'}</a>
              : c.visibility === 'private'
                ? <span className={st.next}>لتجديد الوصول تواصل مع إدارة البرنامج</span>
                : <a className="btn" href={`/courses/${c.slug}/enroll`}>جدّد الوصول</a>}
            <a className="btn ghost" href={`/learn/${c.slug}`}>المنهج</a>
            {open && c.startsAt && <a className="btn ghost" href={`/courses/${c.slug}/calendar${e.cohortId ? `?cohort=${e.cohortId}` : ''}`}>أضف إلى التقويم</a>}
          </div>
        </article>
        )
      })}
    </div>
    </>
  )
}
