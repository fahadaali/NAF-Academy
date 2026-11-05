/* آراء المتدربين — اقتباسات حقيقية يضيفها الفريق من اللوحة (لا آراء افتراضية). تتتابع عند الظهور. */
import type { MediaView } from '@/content/types'
import type { SectionHead, Voice } from '@/content/home-defaults'
import { Words } from '@/components/Words'
import { Picture } from '@/components/Picture'
import styles from './Voices.module.css'

export function Voices({ head, items, photos }: { head: SectionHead; items: Voice[]; photos: Map<string, MediaView> }) {
  if (!items.length) return null
  return (
    <section id="voices" className={styles.voices} aria-labelledby="voices-title">
      <div className="wrap">
        {head.eyebrow && <span className="eyebrow">{head.eyebrow}</span>}
        {head.title && <Words as="h2" id="voices-title" text={head.title} className={`scene-title ${styles.title}`} />}
        <ul role="list" className={`${styles.grid} stagger reveal`}>
          {items.map((v, i) => {
            const photo = v.photoId ? photos.get(v.photoId) : undefined
            return (
              <li key={i} className={styles.card}>
                <blockquote className={styles.quote}><p>{v.quote}</p></blockquote>
                <div className={styles.who}>
                  <span className={styles.avatar} aria-hidden="true">{photo ? <Picture media={photo} /> : v.name.slice(0, 1)}</span>
                  <span><strong>{v.name}</strong>{v.role && <small>{v.role}</small>}</span>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
