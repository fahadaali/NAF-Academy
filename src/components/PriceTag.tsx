'use client'
/* عرض السعر: الحالي بارز، والأصلي مشطوب خافت، وشارة التوفير، وعدّاد العرض. */
import { useEffect, useState } from 'react'
import type { Pricing } from '@/content/types'
import { formatAmount, priceView } from '@/lib/pricing'
import { Riyal } from './Riyal'
import styles from './PriceTag.module.css'

function remaining(end: Date, now: number) {
  const ms = Math.max(0, end.getTime() - now)
  const d = Math.floor(ms / 864e5)
  const h = Math.floor((ms % 864e5) / 36e5)
  const m = Math.floor((ms % 36e5) / 6e4)
  return { d, h, m, done: ms === 0 }
}

export function PriceTag({ pricing, size = 'm' }: { pricing: Pricing; size?: 's' | 'm' | 'l' }) {
  /* الحساب الأول بلا "الآن" المتغير ليطابق الخادم، ثم يتحدّث كل دقيقة */
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  const v = priceView(pricing, now ? new Date(now) : undefined)

  if (v.free) return <div className={`${styles.tag} ${styles[size]}`}><strong className={styles.current}>مجاناً</strong></div>

  const left = v.endsAt && now ? remaining(v.endsAt, now) : null
  return (
    <div className={`${styles.tag} ${styles[size]}`}>
      <div className={styles.row}>
        <strong className={`${styles.current} num`}>
          {pricing.from && <span className={styles.from}>من </span>}{formatAmount(v.current)} <Riyal />
        </strong>
        {v.original && (
          <s className={`${styles.original} num`} aria-label={`السعر قبل العرض ${formatAmount(v.original)} ريال`}>
            {formatAmount(v.original)} <Riyal />
          </s>
        )}
        {v.savePct ? <span className={`${styles.save} num`}>وفّر {v.savePct}%</span> : null}
      </div>
      {v.label && <span className={styles.promo}>{v.label}</span>}
      {left && !left.done && (
        <div className={`${styles.countdown} num`}>
          <span className={styles.pulse} aria-hidden="true" />
          ينتهي العرض بعد {left.d > 0 && <>{left.d} يوم · </>}{left.h} ساعة · {left.m} دقيقة
        </div>
      )}
    </div>
  )
}
