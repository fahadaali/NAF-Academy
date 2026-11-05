/* المدربون — كشف الصورة بـ clip-path، وطريقة الظهور لكل مدرب من اللوحة (كاملة/مختصرة/مخفية). */
import type { Instructor } from '@/content/types'
import { Words } from '@/components/Words'
import { Tilt } from './Tilt'
import styles from './Instructors.module.css'

export function Instructors({ people }: { people: Instructor[] }) {
  const shown = people.filter((p) => p.display !== 'hidden')
  return (
    <section id="instructors" className={styles.people} aria-labelledby="people-title">
      <div className="wrap">
        <span className="eyebrow">المدربون</span>
        <Words as="h2" id="people-title" text="يعلّمك من مارس، لا من حف~3ظ." className={`scene-title ${styles.title}`} />
        <ul role="list" className={styles.grid}>
          {shown.map((p, i) => (
            <li key={p.slug} className={`reveal ${styles.item}`} data-display={p.display} style={{ ['--d' as string]: i }}>
              <Tilt className={styles.card}>
                <div className={styles.portrait} aria-hidden="true">
                  <svg viewBox="0 0 100 100" className={styles.bust}>
                    <circle cx="50" cy="38" r="15" />
                    <path d="M20 92c2-18 14-28 30-28s28 10 30 28" />
                  </svg>
                  <span className={styles.rings} />
                </div>
                <div className={styles.info}>
                  {p.featured && <span className={styles.badge}>مدرب مميز</span>}
                  <h3 className={styles.name}>{p.name}</h3>
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
