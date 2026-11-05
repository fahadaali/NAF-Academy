import { and, eq } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { currentLearner } from '@/server/learner-auth'
import { formatDay, formatHijri, formatTime } from '@/lib/dates'
import { modeLabel } from '@/lib/course-meta'
import { plain } from '@/motion/kashida'
import { learnerCourse } from '@/server/learning'
import { Ring } from '@/site/learn/Outline'
import st from '@/site/learn/learn.module.css'

export default async function MyCourses() {
  const me = (await currentLearner())!
  const rows = await db.select({ e: s.enrollments, c: s.courses, tier: s.priceTiers.name }).from(s.enrollments)
    .innerJoin(s.courses, eq(s.courses.id, s.enrollments.courseId)).leftJoin(s.priceTiers, eq(s.priceTiers.id, s.enrollments.tierId))
    .where(and(eq(s.enrollments.learnerId, me.id), eq(s.enrollments.status, 'active')))
  if (!rows.length)
    return <div className={st.empty}><strong>لم تسجّل في دورة بعد.</strong><a className="btn" href="/courses">تصفّح الدورات</a></div>
  const now = Date.now()
  const prog = new Map(await Promise.all(rows.map(async ({ c }) => { const x = await learnerCourse(c.slug, me); return [c.id, { pct: x?.pct ?? 0, resume: x?.resumeId ?? null, next: x?.upcoming[0] ?? null }] as const })))
  return (
    <div className={st.grid}>
      {rows.sort((a, b) => (a.c.startsAt ?? '9').localeCompare(b.c.startsAt ?? '9')).map(({ e, c, tier }) => (
        <article key={e.id} className={st.course}>
          <div className={st.courseHead}>
            <div><span className="eyebrow">{modeLabel[c.mode]}{tier ? ` · ${tier}` : ''}</span><h2>{plain(c.title)}</h2></div>
            <Ring pct={prog.get(c.id)!.pct} size={72} />
          </div>
          <div className={`${st.meta} num`}>
            {c.startsAt && <span>{formatDay(c.startsAt)} · {formatTime(c.startsAt)} · {formatHijri(c.startsAt)}</span>}
            <span>{c.hours} ساعة</span>
            {c.city && <span>{c.city}</span>}
          </div>
          {c.startsAt && Date.parse(c.startsAt) > now && (
            <div className={`${st.next} num`}>تبدأ بعد {Math.ceil((Date.parse(c.startsAt) - now) / 864e5)} يوماً — ستصلك التذكيرات قبلها</div>
          )}
          {prog.get(c.id)!.next && <div className={`${st.next} num`}>الجلسة القادمة: {prog.get(c.id)!.next!.title} — {formatDay(prog.get(c.id)!.next!.startsAt!)} · {formatTime(prog.get(c.id)!.next!.startsAt!)}</div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a className="btn" href={prog.get(c.id)!.resume ? `/learn/${c.slug}/${prog.get(c.id)!.resume}` : `/learn/${c.slug}`}>{prog.get(c.id)!.pct ? 'تابع التعلّم' : 'ابدأ'}</a>
            <a className="btn ghost" href={`/learn/${c.slug}`}>المنهج</a>
            {c.startsAt && <a className="btn ghost" href={`/courses/${c.slug}/calendar`}>أضف إلى التقويم</a>}
          </div>
        </article>
      ))}
    </div>
  )
}
