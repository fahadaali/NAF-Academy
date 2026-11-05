/* عرض الكتل — عناصر React فقط (لا HTML خام)، والصور من المكتبة بنقطة تركيزها، والعناوين تقبل الكشيدة. */
import type { ReactNode } from 'react'
import { inline, type Block } from '@/lib/blocks'
import type { MediaView } from '@/content/types'
import { Kashida } from './Kashida'
import { Picture } from './Picture'

function Line({ text }: { text: string }) {
  return (
    <>
      {inline(text).map((x, i) =>
        x.kind === 'b' ? <strong key={i}>{x.text}</strong>
          : x.kind === 'i' ? <em key={i}>{x.text}</em>
            : x.kind === 'a' ? <a key={i} href={x.href} target={x.href.startsWith('mailto:') ? undefined : '_blank'} rel="noopener noreferrer">{x.text}</a>
              : <span key={i}>{x.text}</span>,
      )}
    </>
  )
}

/** `media`: صور الكتل بمعرّفاتها (تُجلب على الخادم) — الصورة المحذوفة لا تُعرض */
export function Blocks({ blocks, media, className = '' }: { blocks: Block[]; media: Map<string, MediaView>; className?: string }) {
  const out: ReactNode[] = blocks.map((b, i) => {
    switch (b.t) {
      case 'p': return b.text.trim() ? <p key={i}><Line text={b.text} /></p> : null
      case 'h': return b.text.trim() ? <h3 key={i}><Kashida text={b.text} /></h3> : null
      case 'ul': return <ul key={i}>{b.items.filter(Boolean).map((x, j) => <li key={j}><Line text={x} /></li>)}</ul>
      case 'ol': return <ol key={i}>{b.items.filter(Boolean).map((x, j) => <li key={j}><Line text={x} /></li>)}</ol>
      case 'quote': return <blockquote key={i} className="prose-quote"><p><Line text={b.text} /></p>{b.cite && <cite>{b.cite}</cite>}</blockquote>
      case 'note': return <aside key={i} className="prose-note" data-tone={b.tone}><Line text={b.text} /></aside>
      case 'img': {
        const m = media.get(b.mediaId)
        return m ? <figure key={i} className="prose-figure wipe"><Picture media={m} />{b.caption && <figcaption>{b.caption}</figcaption>}</figure> : null
      }
      case 'video': return /^https:\/\//.test(b.url)
        ? <figure key={i} className="prose-figure"><video src={b.url} controls preload="metadata" playsInline />{b.caption && <figcaption>{b.caption}</figcaption>}</figure>
        : null
      case 'hr': return <hr key={i} className="prose-hr" />
    }
  })
  return <div className={`prose ${className}`}>{out}</div>
}
