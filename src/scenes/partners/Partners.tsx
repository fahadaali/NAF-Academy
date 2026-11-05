/* الجهات الشريكة — شعارات يرفعها الفريق، بلا ألوان حتى المرور (ثم بلونها). الاسم بديل الشعار الغائب. */
import type { MediaView } from '@/content/types'
import type { Partner, SectionHead } from '@/content/home-defaults'
import { Words } from '@/components/Words'
import styles from './Partners.module.css'

export function Partners({ head, items, logos }: { head: SectionHead; items: Partner[]; logos: Map<string, MediaView> }) {
  if (!items.length) return null
  return (
    <section id="partners" className={styles.partners} aria-labelledby={head.title ? 'partners-title' : undefined} aria-label={head.title ? undefined : head.eyebrow || 'الجهات الشريكة'}>
      <div className="wrap">
        {head.eyebrow && <span className="eyebrow">{head.eyebrow}</span>}
        {head.title && <Words as="h2" id="partners-title" text={head.title} className={`scene-title ${styles.title}`} />}
        <ul role="list" className={`${styles.row} stagger reveal`}>
          {items.map((x, i) => {
            const logo = x.logoId ? logos.get(x.logoId) : undefined
            // eslint-disable-next-line @next/next/no-img-element
            const mark = logo ? <img src={logo.url} alt={x.name} loading="lazy" /> : <span className={styles.name}>{x.name}</span>
            return <li key={i} className={styles.item}>{x.url ? <a href={x.url} target="_blank" rel="noreferrer" aria-label={x.name}>{mark}</a> : mark}</li>
          })}
        </ul>
      </div>
    </section>
  )
}
