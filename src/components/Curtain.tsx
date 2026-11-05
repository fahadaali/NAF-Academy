/* الستار الافتتاحي: يظهر فقط تحت html.opening (يضعه boot.js قبل الرسم). */
import { LogoMark } from './Logo'
import { Emblem } from './Emblem'
import { brandView } from '@/server/brand'
import styles from './Curtain.module.css'

export async function Curtain() {
  const brand = await brandView()
  const logo = brand.academy.light || brand.academy.dark
  return (
    <div className={styles.curtain} aria-hidden="true">
      <div className={styles.core}>
        {logo ? <LogoMark pair={brand.academy} alt="" height={92} tone="dark" /> : <Emblem size={92} draw />}
        {(brand.showName || !logo) && <span className={styles.name}>{brand.name}</span>}
      </div>
    </div>
  )
}
