/* الستار الافتتاحي: يظهر فقط تحت html.opening (يضعه boot.js قبل الرسم). */
import { Emblem } from './Emblem'
import styles from './Curtain.module.css'

export function Curtain() {
  return (
    <div className={styles.curtain} aria-hidden="true">
      <div className={styles.core}>
        <Emblem size={92} draw />
        <span className={styles.name}>أكاديمية ناف</span>
      </div>
    </div>
  )
}
