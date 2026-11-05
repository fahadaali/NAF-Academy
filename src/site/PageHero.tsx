/* افتتاحية الصفحات الداخلية — سطح ليلي، عنوان يتكشّف، ووصف. */
import type { ReactNode } from 'react'
import { Words } from '@/components/Words'

export function PageHero({ eyebrow, title, body, children, glyph }: { eyebrow?: string; title: string; body?: string; children?: ReactNode; glyph?: string }) {
  return (
    <header data-surface="night" style={{ position: 'relative', overflow: 'hidden', background: 'var(--scene-bg)', color: 'var(--scene-text)', paddingBlock: 'calc(var(--header-h) + clamp(44px, 9vh, 100px)) clamp(44px, 8vh, 90px)' }}>
      {glyph && <span aria-hidden="true" style={{ position: 'absolute', insetInlineStart: '4%', insetBlockEnd: '-28%', fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'clamp(260px, 34vw, 520px)', lineHeight: 1, color: 'transparent', WebkitTextStroke: '1.2px rgb(201 162 90 / 0.4)' }}>{glyph}</span>}
      <div className="wrap" style={{ position: 'relative', display: 'grid', gap: 16, justifyItems: 'start' }}>
        {eyebrow && <span className="eyebrow" style={{ color: 'var(--gold-4)' }}>{eyebrow}</span>}
        <Words as="h1" text={title} className="scene-title" />
        {body && <p className="reveal" style={{ ['--d' as string]: 2, color: 'var(--scene-muted)', fontSize: 'var(--fs-statement)', maxInlineSize: '56ch' }}>{body}</p>}
        {children}
      </div>
    </header>
  )
}
