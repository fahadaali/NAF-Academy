/* الستار الافتتاحي: يظهر فقط تحت html.opening (يضعه boot.js قبل الرسم). */
import { LiveLogo } from './LiveLogo'
import { brandView } from '@/server/brand'
import { hasLogo } from '@/lib/brand'
import styles from './Curtain.module.css'

export async function Curtain() {
  const brand = await brandView()
  /* موضع كبير: الشعار الكامل متحركاً، وإلا صيغة الشريط، وإلا رمز الكتاب يتكشّف */
  const full = hasLogo(brand.lockup)
  const logo = full || hasLogo(brand.academy)
  return (
    <div className={styles.curtain} aria-hidden="true">
      <div className={styles.core}>
        <LiveLogo pair={full ? brand.lockup : brand.academy} alt="" height={full ? 120 : 92} tone="dark" />
        {(brand.showName || !logo) && <span className={styles.name}>{brand.name}</span>}
      </div>
    </div>
  )
}
