/* أسئلة شائعة عامة — أكورديون أصلي (details)، ويُعلَن لمحركات البحث FAQPage. */
import type { SectionHead } from '@/content/home-defaults'
import { Words } from '@/components/Words'
import { ldJson } from '@/lib/seo'
import styles from './Faq.module.css'

export function Faq({ head, items }: { head: SectionHead; items: { q: string; a: string }[] }) {
  if (!items.length) return null
  const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })) }
  return (
    <section id="faq" className={styles.faq} aria-labelledby="faq-title">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson([ld]) }} />
      <div className={`wrap ${styles.grid}`}>
        <div>
          {head.eyebrow && <span className="eyebrow">{head.eyebrow}</span>}
          <Words as="h2" id="faq-title" text={head.title || head.eyebrow || 'أسئلة شائعة'} className={`scene-title ${styles.title}`} />
        </div>
        <div className={`${styles.list} stagger reveal`}>
          {items.map((x, i) => (
            <details key={i} className={styles.item}>
              <summary>{x.q}<span className={styles.chev} aria-hidden="true" /></summary>
              <p>{x.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
