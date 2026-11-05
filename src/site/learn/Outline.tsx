/* فهرس الدورة داخل مساحة التعلّم — حالة كل درس: مكتمل، مفتوح، مجدول، مقفل بالتسلسل. */
import type { ModuleState } from '@/server/learning'
import { formatDay, formatTime } from '@/lib/dates'
import o from './outline.module.css'

const ICON: Record<string, string> = { video: '▶', article: '¶', file: '⇩', quiz: '?', live: '●', onsite: '⌖', assignment: '✎' }

export function Outline({ slug, modules, current }: { slug: string; modules: ModuleState[]; current?: string }) {
  return (
    <nav className={o.outline} aria-label="المنهج">
      {modules.map((m, mi) => (
        <section key={m.id}>
          <h3><span className="num">{mi + 1}</span>{m.title}</h3>
          <ol role="list">
            {m.lessons.map((l) => {
              const locked = l.access.state !== 'open'
              const sub = l.access.state === 'drip' ? `يُفتح ${formatDay(l.access.opensAt)}` : l.access.state === 'sequence' ? 'أكمل ما قبله' : l.startsAt ? `${formatDay(l.startsAt)} · ${formatTime(l.startsAt)}` : l.minutes ? `${l.minutes} د` : ''
              const inner = (
                <>
                  <span className={o.icon} data-done={l.done ? '1' : '0'} aria-hidden="true">{l.done ? '✓' : locked ? '🔒' : ICON[l.type]}</span>
                  <span className={o.text}><span>{l.title}</span>{sub && <small className="num">{sub}</small>}</span>
                </>
              )
              return (
                <li key={l.id} data-current={current === l.id ? '1' : '0'} data-locked={locked ? '1' : '0'}>
                  {locked ? <span className={o.row} aria-disabled="true">{inner}<span className="sr-only">مقفل</span></span>
                    : <a className={o.row} href={`/learn/${slug}/${l.id}`} aria-current={current === l.id ? 'page' : undefined}>{inner}</a>}
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </nav>
  )
}

export function Ring({ pct, size = 92 }: { pct: number; size?: number }) {
  const r = 40
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={o.ring} role="img" aria-label={`أنجزت ${pct}%`}>
      <circle cx="50" cy="50" r={r} className={o.ringBg} />
      <circle cx="50" cy="50" r={r} className={o.ringFg} style={{ strokeDasharray: c, strokeDashoffset: c * (1 - pct / 100) }} />
      <text x="50" y="56" textAnchor="middle" className={o.ringText}>{pct}%</text>
    </svg>
  )
}
