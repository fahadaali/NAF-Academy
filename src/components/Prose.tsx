/* منسّق نص بسيط وآمن (بلا HTML): فقرات، وعناوين ## ، وقوائم - . */
import type { ReactNode } from 'react'

export function Prose({ text, className = '' }: { text: string; className?: string }) {
  const out: ReactNode[] = []
  let list: string[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) out.push(<p key={out.length}>{para.join(' ')}</p>)
    if (list.length) out.push(<ul key={out.length}>{list.map((l, i) => <li key={i}>{l}</li>)}</ul>)
    para = []
    list = []
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) { flush(); continue }
    if (line.startsWith('## ')) { flush(); out.push(<h3 key={out.length}>{line.slice(3)}</h3>); continue }
    if (/^[-•]\s/.test(line)) { if (para.length) { const p = para; para = []; out.push(<p key={out.length}>{p.join(' ')}</p>) } list.push(line.slice(2)); continue }
    if (list.length) flush()
    para.push(line)
  }
  flush()
  return <div className={`prose ${className}`}>{out}</div>
}
