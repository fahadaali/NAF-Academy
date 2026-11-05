import { LiveWordmark } from './LiveLogo'
import type { BrandView } from '@/lib/brand'
import { Words } from './Words'
import styles from './Footer.module.css'

export async function Footer({ title, cta, brand }: { title: string; cta: string; brand: BrandView }) {
  return (
    <footer data-surface="night" className={styles.footer}>
      <div className={`wrap ${styles.cta}`}>
        <Words as="p" text={title} className={styles.big} />
        <a href="/courses" className="btn reveal" style={{ ['--d' as string]: 1 }}>{cta}</a>
      </div>
      <div className={`wrap ${styles.bottom}`}>
        <LiveWordmark brand={brand} className={`${styles.mark} reveal`} tone="dark" />
        <nav aria-label="روابط" className={styles.links}>
          <a href="/courses">الدورات</a>
          <a href="/tracks">المسارات</a>
          <a href="/certificates/verify">تحقق من شهادة</a>
          <a href="/policies">السياسات</a>
        </nav>
        <p className={`${styles.copy} num`}>
          <span>© {new Date().getFullYear()} {brand.name} — إحدى مبادرات {brand.companyName}</span>
        </p>
      </div>
    </footer>
  )
}
