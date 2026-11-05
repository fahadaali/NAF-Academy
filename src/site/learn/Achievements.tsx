/* إنجازاتي — شارات مرسومة من رموز الهوية (لا صور)، تتكشّف متتابعة. الفارغة تدعو للبدء بلا محتوى مختلق. */
import { ACHIEVEMENTS, type AchievementKind } from '@/lib/achievements'
import type { BadgeView } from '@/server/achievements'
import { formatDay } from '@/lib/dates'
import a from './achievements.module.css'

/* رمز كل شارة: خطوط بسيطة بلون الحبر على قرص ذهبي */
const GLYPH: Record<string, React.ReactNode> = {
  step: <path d="M30 64h14V52h14V40h14" />,
  half: <><circle cx="50" cy="50" r="18" /><path d="M50 32v36" /></>,
  done: <path d="M34 51l11 11 21-24" />,
  seal: <><circle cx="50" cy="46" r="14" /><path d="M42 58l-4 14 12-6 12 6-4-14" /></>,
  seat: <><path d="M36 40h28v14H36z" /><path d="M38 54v14M62 54v14" /></>,
  star: <path d="M50 30l6 13 14 1-11 9 4 14-13-8-13 8 4-14-11-9 14-1z" />,
  stack: <><path d="M32 60h36M34 50h32M36 40h28" /></>,
  path: <path d="M30 66c10-4 12-14 20-16s14 6 20-18" />,
}

export function Achievements({ items }: { items: BadgeView[] }) {
  const all = Object.keys(ACHIEVEMENTS) as AchievementKind[]
  const have = new Set(items.map((x) => x.kind))
  return (
    <section className={a.box} id="achievements" aria-labelledby="ach-h">
      <div className={a.head}>
        <h2 id="ach-h">إنجازاتي</h2>
        <span className="num">{have.size} / {all.length}</span>
      </div>
      <ul role="list" className={`${a.list} stagger reveal`}>
        {items.map((x) => (
          <li key={`${x.kind}:${x.ref}`} className={a.badge} title={x.body}>
            <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" className={a.disc} /><g className={a.ink}>{GLYPH[x.glyph]}</g></svg>
            <strong>{x.title}</strong>
            <small>{x.refTitle || x.body}</small>
            <small className="num">{formatDay(x.at)}</small>
          </li>
        ))}
        {all.filter((k) => !have.has(k)).map((k) => (
          <li key={k} className={a.badge} data-locked="1" title={ACHIEVEMENTS[k].body}>
            <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" className={a.disc} /><g className={a.ink}>{GLYPH[ACHIEVEMENTS[k].glyph]}</g></svg>
            <strong>{ACHIEVEMENTS[k].title}</strong>
            <small>{ACHIEVEMENTS[k].body}</small>
          </li>
        ))}
      </ul>
    </section>
  )
}
