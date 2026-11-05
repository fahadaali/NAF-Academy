/* المدربون — كشف الصورة بـ clip-path، وطريقة الظهور لكل مدرب من اللوحة (كاملة/مختصرة/مخفية). */
import type { Instructor } from '@/content/types'
import { Words } from '@/components/Words'
import { Tilt } from './Tilt'
import { Picture } from '@/components/Picture'
import type { SectionHead } from '@/content/home-defaults'
import styles from './Instructors.module.css'

export function Instructors({ people, head }: { people: Instructor[]; head: SectionHead }) {
  const shown = people.filter((p) => p.display !== 'hidden')
  return (
    <section id="instructors" className={styles.people} aria-labelledby="people-title">
      <div className="wrap">
        <span className="eyebrow">{head.eyebrow}</span>
        <Words as="h2" id="people-title" text={head.title} className={`scene-title ${styles.title}`} />
        <ul role="list" className={styles.grid}>
          {shown.map((p, i) => (
            <li key={p.slug} className={`reveal ${styles.item}`} data-display={p.display} style={{ ['--d' as string]: i }}>
              <Tilt className={styles.card}>
                <a href={`/instructors/${p.slug}`} className={styles.portrait} aria-label={p.name}>
                  {p.photo ? <Picture media={p.photo} className={styles.photo} /> : <svg viewBox="0 0 100 100" className={styles.bust}>
                    <circle cx="50" cy="38" r="15" />
                    <path d="M20 92c2-18 14-28 30-28s28 10 30 28" />
                  </svg>}
                  {!p.photo && <span className={styles.rings} />}
                </a>
                <div className={styles.info}>
                  {p.featured && <span className={styles.badge}>مدرب مميز</span>}
                  <h3 className={styles.name}><a href={`/instructors/${p.slug}`}>{p.name}</a></h3>
                  <p className={styles.role}>{p.title}</p>
                  {p.display === 'full' && (
                    <ul role="list" className={styles.hl}>
                      {p.highlights.map((h) => <li key={h}>{h}</li>)}
                    </ul>
                  )}
                </div>
              </Tilt>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
