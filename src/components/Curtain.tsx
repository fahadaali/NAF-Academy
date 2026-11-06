/* الستار الافتتاحي: يظهر فقط تحت html.opening (يضعه boot.js قبل الرسم).
   اللمسة: هالة ذهبية خلف الشعار تشتدّ لحظة حطّ الختم، وحبّات متوهجة تتجمّع نحوه أثناء كتابته، ثم شعاع ضوء يعبره مرة.
   كلها طبقات زخرفية ثابتة الرسم تتحرك بـ transform/opacity — لا تمسّ هندسة الشعار ولا ألوانه (قواعد حزمة الهوية). */
import type { CSSProperties } from 'react'
import { LiveLogo } from './LiveLogo'
import { brandView } from '@/server/brand'
import { hasLogo, pick } from '@/lib/brand'
import styles from './Curtain.module.css'

/* مواضع ثابتة (لا عشوائية: الخادم والمتصفح سواء) — حلزون الزاوية الذهبية حول الشعار */
const GRAINS = Array.from({ length: 12 }, (_, i) => {
  const a = i * 2.39996
  const r = 0.62 + ((i * 37) % 11) / 22 // 0.62…1.1 من نصف قطر الحلقة
  return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.55, s: 0.55 + ((i * 13) % 7) / 10, i }
})

export async function Curtain() {
  const brand = await brandView()
  /* موضع كبير: الشعار الكامل متحركاً، وإلا صيغة الشريط، وإلا رمز الكتاب يتكشّف */
  const full = hasLogo(brand.lockup)
  const logo = full || hasLogo(brand.academy)
  const pair = full ? brand.lockup : brand.academy
  /* قناع الشعاع: شكل الشعار نفسه (أي نسخة — يكفي شكلها) */
  const shape = pick(pair, 'light')?.url
  return (
    <div className={styles.curtain} data-curtain aria-hidden="true">
      <div className={styles.core}>
        <span className={styles.halo} />
        <span className={styles.grains}>
          {GRAINS.map((g) => (
            <i key={g.i} style={{ '--gx': g.x.toFixed(3), '--gy': g.y.toFixed(3), '--gs': g.s.toFixed(2), '--gi': g.i } as CSSProperties} />
          ))}
        </span>
        <span className={styles.stage}>
          <LiveLogo pair={pair} alt="" height={full ? 120 : 92} />
          {shape && <span className={styles.beam} style={{ '--shape': `url("${shape}")` } as CSSProperties}><span /></span>}
        </span>
        {(brand.showName || !logo) && <span className={styles.name}>{brand.name}</span>}
      </div>
    </div>
  )
}
