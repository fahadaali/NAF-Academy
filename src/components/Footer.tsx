import { Wordmark } from './Emblem'
import { Words } from './Words'
import styles from './Footer.module.css'

export function Footer() {
  return (
    <footer data-surface="night" className={styles.footer}>
      <div className={`wrap ${styles.cta}`}>
        <Words as="p" text="الدرجة الأولى أقرب مما تظ~4ن." className={styles.big} />
        <a href="#courses" className="btn reveal" style={{ ['--d' as string]: 1 }}>ابدأ الآن</a>
      </div>
      <div className={`wrap ${styles.bottom}`}>
        <Wordmark className={styles.mark} />
        <nav aria-label="روابط" className={styles.links}>
          <a href="/courses">الدورات</a>
          <a href="/tracks">المسارات</a>
          <a href="/events">الفعاليات</a>
          <a href="/certificates/verify">تحقق من شهادة</a>
          <a href="/policies">السياسات</a>
        </nav>
        <p className={`${styles.copy} num`}>© 2026 أكاديمية ناف — إحدى مبادرات شركة ناف القانونية</p>
      </div>
    </footer>
  )
}
