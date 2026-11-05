/* كتل المحتوى الغني — نموذج واحد للمحرّر والعرض والتحقق. لا HTML خام أبداً:
   التنسيق داخل السطر بصيغة مقيّدة (**عريض**، *مائل*، [نص](https://…))، والعرض يبنيه عناصر React. */

export type InlineVideo = { provider: 'url'; url: string } | { provider: 'none' }

export type Block =
  | { t: 'p'; text: string }
  | { t: 'h'; text: string }
  | { t: 'ul'; items: string[] }
  | { t: 'ol'; items: string[] }
  | { t: 'quote'; text: string; cite: string }
  | { t: 'note'; text: string; tone: 'info' | 'gold' }
  | { t: 'img'; mediaId: string; caption: string }
  | { t: 'video'; url: string; caption: string }
  | { t: 'hr' }

export type BlockType = Block['t']

export const BLOCK_LABEL: Record<BlockType, string> = {
  p: 'فقرة', h: 'عنوان', ul: 'قائمة نقطية', ol: 'قائمة مرقّمة', quote: 'اقتباس', note: 'تنبيه', img: 'صورة', video: 'فيديو', hr: 'فاصل',
}

export function emptyBlock(t: BlockType): Block {
  switch (t) {
    case 'ul': case 'ol': return { t, items: [''] }
    case 'quote': return { t, text: '', cite: '' }
    case 'note': return { t, text: '', tone: 'gold' }
    case 'img': return { t, mediaId: '', caption: '' }
    case 'video': return { t, url: '', caption: '' }
    case 'hr': return { t }
    default: return { t, text: '' }
  }
}

/** النص القديم (فقرات، ## عناوين، - قوائم) ← كتل — بالقواعد نفسها التي كان يعرضها Prose */
export function blocksFrom(text: string): Block[] {
  const out: Block[] = []
  let para: string[] = []
  let list: string[] = []
  const flush = () => {
    if (para.length) out.push({ t: 'p', text: para.join(' ') })
    if (list.length) out.push({ t: 'ul', items: list })
    para = []
    list = []
  }
  for (const raw of (text ?? '').split('\n')) {
    const line = raw.trim()
    if (!line) { flush(); continue }
    if (line.startsWith('## ')) { flush(); out.push({ t: 'h', text: line.slice(3) }); continue }
    if (/^[-•]\s/.test(line)) { if (para.length) { out.push({ t: 'p', text: para.join(' ') }); para = [] } list.push(line.slice(2)); continue }
    if (list.length) flush()
    para.push(line)
  }
  flush()
  return out
}

/** الكتل ← نص عادي (لوصف الدورة في البحث والرسائل والنسخة النصية) */
export function blocksText(blocks: Block[]): string {
  const strip = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/\[(.+?)\]\((.+?)\)/g, '$1')
  return blocks.map((b) => {
    switch (b.t) {
      case 'p': case 'note': return strip(b.text)
      case 'h': return `## ${strip(b.text)}`
      case 'ul': case 'ol': return b.items.map((x) => `- ${strip(x)}`).join('\n')
      case 'quote': return strip(b.text)
      default: return ''
    }
  }).filter(Boolean).join('\n\n')
}

export type Inline = { kind: 'text' | 'b' | 'i'; text: string } | { kind: 'a'; text: string; href: string }

/** سطر منسّق ← مقاطع. الروابط http(s) وmailto فقط — غيرها نص */
export function inline(s: string): Inline[] {
  const out: Inline[] = []
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)\s]+)\)/g
  let last = 0
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) out.push({ kind: 'text', text: s.slice(last, m.index) })
    if (m[1]) out.push({ kind: 'b', text: m[1] })
    else if (m[2]) out.push({ kind: 'i', text: m[2] })
    else if (/^(https?:\/\/|mailto:)/i.test(m[4])) out.push({ kind: 'a', text: m[3], href: m[4] })
    else out.push({ kind: 'text', text: m[0] })
    last = re.lastIndex
  }
  if (last < s.length) out.push({ kind: 'text', text: s.slice(last) })
  return out
}
