/* عنوان يتكشّف كلمة كلمة. يُرسم على الخادم، والحركة كلها CSS عبر --i. */
import type { ElementType, ReactNode } from 'react'
import { hasMark, plain } from '@/motion/kashida'
import { Kashida } from './Kashida'

type Props = {
  text: string | string[]
  as?: ElementType
  className?: string
  /** تأخير إضافي بوحدات الإيقاع */
  delay?: number
  /** بلا .reveal: يتحكم فيه الأب (مثل الستار) */
  manual?: boolean
  id?: string
}

export function Words({ text, as: Tag = 'span', className = '', delay = 0, manual, id }: Props) {
  const lines = Array.isArray(text) ? text : [text]
  let i = 0
  const out: ReactNode[] = []
  lines.forEach((line, li) => {
    line.split(/\s+/).filter(Boolean).forEach((word, wi) => {
      out.push(
        <span className="w" key={`${li}-${wi}`}>
          <span style={{ ['--i' as string]: i++ }}>{hasMark(word) ? <Kashida text={word} decorative /> : word}</span>
        </span>,
        ' ',
      )
    })
    if (li < lines.length - 1) out.push(<br key={`br-${li}`} />)
  })
  return (
    <Tag id={id} className={`words ${manual ? 'manual' : 'reveal'} ${className}`} style={{ ['--d' as string]: delay }}>
      <span className="sr-only">{plain(lines.join(' '))}</span>
      <span aria-hidden="true">{out}</span>
    </Tag>
  )
}
