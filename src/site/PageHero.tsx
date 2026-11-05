/* افتتاحية الصفحات الداخلية — سطح ليلي، عنوان يتكشّف، ووصف. */
import type { ReactNode } from 'react'
import { Words } from '@/components/Words'
import s from './pages.module.css'

export function PageHero({ eyebrow, title, body, children, glyph }: { eyebrow?: string; title: string; body?: string; children?: ReactNode; glyph?: string }) {
  return (
    <header data-surface="night" className={s.hero}>
      {glyph && <span aria-hidden="true" className={s.glyph}>{glyph}</span>}
      <div className={`wrap ${s.inner}`}>
        {eyebrow && <span className={`eyebrow ${s.eyebrow}`}>{eyebrow}</span>}
        <Words as="h1" text={title} className="scene-title" />
        {body && <p className={`reveal ${s.lead}`} style={{ ['--d' as string]: 2 }}>{body}</p>}
        {children}
      </div>
    </header>
  )
}
