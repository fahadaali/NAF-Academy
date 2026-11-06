/* الستار الافتتاحي: يظهر فقط تحت html.opening (يضعه boot.js قبل الرسم).
   الشعار يُكتب داخل اللمسة المتوهجة (Glow): هالة ذهبية، وحبّات متوهجة تتجمّع نحوه، وشعاع يعبره بعد الختم. */
import { LiveLogo } from './LiveLogo'
import { Glow } from './Glow'
import { brandView } from '@/server/brand'
import { hasLogo, pick } from '@/lib/brand'
import styles from './Curtain.module.css'

export async function Curtain() {
  const brand = await brandView()
  /* موضع كبير: الشعار الكامل متحركاً، وإلا صيغة الشريط، وإلا رمز الكتاب يتكشّف */
  const full = hasLogo(brand.lockup)
  const logo = full || hasLogo(brand.academy)
  const pair = full ? brand.lockup : brand.academy
  return (
    <div className={styles.curtain} data-curtain aria-hidden="true">
      <div className={styles.core}>
        <Glow shape={pick(pair, 'light')?.url}>
          <LiveLogo pair={pair} alt="" height={full ? 120 : 92} />
        </Glow>
        {(brand.showName || !logo) && <span className={styles.name}>{brand.name}</span>}
      </div>
    </div>
  )
}
