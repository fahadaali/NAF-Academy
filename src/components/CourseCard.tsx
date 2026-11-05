/* بطاقة الدورة — تعرض الحالة بوضوح: المغلقة ظاهرة بطبقة داكنة وشارة، والمكتملة بشريط. */
import type { Course, Instructor, Track } from '@/content/types'
import { levelLabel, modeLabel, statusView } from '@/lib/course-meta'
import { formatDay, formatHijri, formatTime, formatWeekday } from '@/lib/dates'
import { PriceTag } from './PriceTag'
import { Picture } from './Picture'
import styles from './CourseCard.module.css'

type Props = { course: Course; track?: Track; instructor?: Instructor }

export function CourseCard({ course: c, track, instructor }: Props) {
  const st = statusView[c.status]
  if (!st) return null
  const left = c.seats ? c.seats.total - c.seats.taken : undefined
  const fill = c.seats ? c.seats.taken / c.seats.total : 0
  return (
    <article className={styles.card} data-status={st.tone} data-dim={st.dim ? '1' : '0'}>
      <a href={`/courses/${c.slug}`} className={styles.cover} data-tone={track?.tone ?? 'gold'} aria-label={c.title}>
        {c.cover ? <span className={styles.photo} aria-hidden="true"><Picture media={c.cover} /></span> : <span className={styles.glyph} aria-hidden="true">{track?.glyph}</span>}
        <span className={styles.chips}>
          <span className={styles.chip}>{modeLabel[c.mode]}</span>
          <span className={styles.chip}>{levelLabel[c.level]}</span>
        </span>
        <span className={styles.status}>{st.label}</span>
      </a>
      <div className={styles.body}>
        {track && <span className={styles.track}>{track.title}</span>}
        <h3 className={styles.title}><a href={`/courses/${c.slug}`}>{c.title}</a></h3>
        <dl className={`${styles.meta} num`}>
          {c.startsAt ? (
            <div>
              <dt>يبدأ</dt>
              <dd>{formatWeekday(c.startsAt)} {formatDay(c.startsAt)} <small>{formatHijri(c.startsAt)}</small></dd>
            </div>
          ) : (
            <div><dt>البدء</dt><dd>متى شئت</dd></div>
          )}
          <div><dt>{c.startsAt ? 'الساعة' : 'المدة'}</dt><dd>{c.startsAt ? formatTime(c.startsAt) : `${c.hours} ساعات`}</dd></div>
          {c.city && <div><dt>المدينة</dt><dd>{c.city}</dd></div>}
          {!c.city && c.startsAt && <div><dt>المدة</dt><dd>{c.hours} ساعة</dd></div>}
        </dl>
        {c.seats && c.status !== 'closed' && (
          <div className={styles.seats}>
            <div className={styles.bar}><span style={{ ['--f' as string]: fill }} /></div>
            <span className="num">{left && left > 0 ? `بقي ${left} مقعداً` : 'اكتمل العدد'}</span>
          </div>
        )}
        {instructor && <p className={styles.by}>{instructor.title}</p>}
        <div className={styles.foot}>
          <PriceTag pricing={c.pricing} size="s" />
          <a href={`/courses/${c.slug}`} className={`btn ${st.tone === 'open' ? '' : 'ghost'} ${styles.cta}`}>{st.cta}</a>
        </div>
      </div>
    </article>
  )
}
