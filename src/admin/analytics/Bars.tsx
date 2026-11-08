'use client'
/* أعمدة لسلسلة واحدة — لون واحد (--chart-1)، وأطراف مستديرة 4px على خط الأساس، وفجوة 2px،
   ومنطقة لمس بارتفاع العمود كاملاً، وتلميح عند المرور، وعرض جدولي للوصولية. */
import { useState } from 'react'
import b from './bars.module.css'

export type Bar = { key: string; label: string; value: number; display: string }

export function Bars({ title, data, height = 160, total }: { title: string; data: Bar[]; height?: number; total: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...data.map((d) => d.value))
  const peak = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0)
  const h = hover !== null ? data[hover] : null
  /* موضع داخل حدود الرسم — لا يخرج التلميح عن الحافة */
  const at = (i: number) => `${Math.min(86, Math.max(14, ((i + 0.5) / data.length) * 100))}%`
  return (
    <figure className={`${b.fig} reveal`}>
      <figcaption className={b.cap}><span>{title}</span><strong className="num" data-count>{total}</strong></figcaption>
      <div className={b.plot} style={{ ['--plot' as string]: `${height}px` }} onMouseLeave={() => setHover(null)} aria-hidden="true">
        <i className={b.grid} />
        <i className={b.base} />
        {data.map((d, i) => (
          <div key={d.key} className={b.col} data-on={hover === i ? '1' : '0'} onMouseEnter={() => setHover(i)} style={{ ['--k' as string]: i / Math.max(1, data.length - 1) }}>
            <span className={b.bar} style={{ ['--v' as string]: d.value / max }} />
          </div>
        ))}
        {h && (
          <div className={b.tip} style={{ insetInlineStart: at(hover!) }}>
            <span>{h.label}</span><strong className="num">{h.display}</strong>
          </div>
        )}
        {data[peak]?.value > 0 && hover === null && (
          <span className={`${b.peak} num`} style={{ ['--x' as string]: (peak + 0.5) / data.length, ['--v' as string]: data[peak].value / max }}>{data[peak].display}</span>
        )}
      </div>
      <div className={`${b.axis} num`} aria-hidden="true"><span>{data[0]?.label}</span><span>{data[data.length - 1]?.label}</span></div>
      <details className={b.table}>
        <summary>عرض كجدول</summary>
        <table><thead><tr><th>اليوم</th><th>{title}</th></tr></thead><tbody>{data.filter((d) => d.value).map((d) => <tr key={d.key}><td className="num">{d.label}</td><td className="num">{d.display}</td></tr>)}</tbody></table>
      </details>
    </figure>
  )
}
