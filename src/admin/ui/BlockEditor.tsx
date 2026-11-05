'use client'
/* محرّر الكتل — فقرة، عنوان، قوائم، اقتباس، تنبيه، صورة من المكتبة، فيديو، فاصل.
   ترتيب بالسحب أو بالأزرار، وشريط تنسيق يلفّ التحديد بصيغة آمنة (**عريض**، *مائل*، [رابط](https://…)). */
import { useRef } from 'react'
import type { Media } from '@/server/db/schema'
import { BLOCK_LABEL, emptyBlock, type Block, type BlockType } from '@/lib/blocks'
import { Input, ListEditor, RowTools, Segmented, useSortable } from './kit'
import { MediaPicker } from './MediaPicker'
import e from './blocks.module.css'

const ADD: BlockType[] = ['p', 'h', 'ul', 'ol', 'quote', 'note', 'img', 'video', 'hr']
const TEXTY = new Set<BlockType>(['p', 'h', 'quote', 'note'])

function RichText({ value, onChange, rows = 3, single, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; single?: boolean; placeholder?: string }) {
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null)
  const wrap = (a: string, b: string, ask?: string) => {
    const el = ref.current
    if (!el) return
    const [s, t] = [el.selectionStart ?? value.length, el.selectionEnd ?? value.length]
    const sel = value.slice(s, t) || 'نص'
    let after = b
    if (ask) {
      const url = prompt(ask, 'https://')
      if (!url || !/^(https?:\/\/|mailto:)/i.test(url)) return
      after = `](${url})`
    }
    const next = value.slice(0, s) + a + sel + after + value.slice(t)
    onChange(next)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + a.length, s + a.length + sel.length) })
  }
  return (
    <div className={e.rich}>
      <div className={e.bar} role="toolbar" aria-label="تنسيق">
        <button type="button" onClick={() => wrap('**', '**')} aria-label="عريض"><b>ع</b></button>
        <button type="button" onClick={() => wrap('*', '*')} aria-label="مائل"><i>م</i></button>
        <button type="button" onClick={() => wrap('[', '', 'الرابط (https://…)')} aria-label="رابط">🔗</button>
      </div>
      {single
        ? <input ref={ref} className={e.field} value={value} placeholder={placeholder} onChange={(x) => onChange(x.target.value)} />
        : <textarea ref={ref} className={e.field} rows={rows} value={value} placeholder={placeholder} onChange={(x) => onChange(x.target.value)} />}
    </div>
  )
}

export function BlockEditor({ value, onChange, media }: { value: Block[]; onChange: (v: Block[]) => void; media: Media[] }) {
  const { props, move } = useSortable(value, onChange)
  const set = (i: number, b: Block) => onChange(value.map((x, j) => (j === i ? b : x)))
  const insert = (at: number, t: BlockType) => onChange([...value.slice(0, at), emptyBlock(t), ...value.slice(at)])
  /* تحويل بين الأنواع النصية يُبقي النص */
  const convert = (i: number, t: BlockType) => {
    const b = value[i]
    const text = 'text' in b ? b.text : 'items' in b ? b.items.join('\n') : ''
    const next = emptyBlock(t)
    if ('text' in next) (next as { text: string }).text = text
    if ('items' in next) (next as { items: string[] }).items = text ? text.split('\n') : ['']
    set(i, next)
  }

  return (
    <div className={e.editor}>
      {value.length === 0 && <p className={e.empty}>ابدأ بفقرة أو عنوان — الكتل تظهر في صفحة الدورة بالترتيب نفسه.</p>}
      {value.map((b, i) => (
        <div key={i} className={e.block} data-type={b.t} {...props(i)}>
          <div className={e.head}>
            {TEXTY.has(b.t) || b.t === 'ul' || b.t === 'ol' ? (
              <select className={e.type} value={b.t} onChange={(x) => convert(i, x.target.value as BlockType)} aria-label="نوع الكتلة">
                {(['p', 'h', 'ul', 'ol', 'quote', 'note'] as const).map((t) => <option key={t} value={t}>{BLOCK_LABEL[t]}</option>)}
              </select>
            ) : <span className={e.type}>{BLOCK_LABEL[b.t]}</span>}
            <RowTools i={i} n={value.length} move={move} onRemove={() => onChange(value.filter((_, j) => j !== i))} />
          </div>
          {b.t === 'p' && <RichText value={b.text} onChange={(text) => set(i, { ...b, text })} rows={4} />}
          {b.t === 'h' && <RichText single value={b.text} onChange={(text) => set(i, { ...b, text })} placeholder="العنوان — ~ ثم رقم لموضع الكشيدة" />}
          {(b.t === 'ul' || b.t === 'ol') && <ListEditor value={b.items} onChange={(items) => set(i, { ...b, items })} add="بند" />}
          {b.t === 'quote' && (
            <>
              <RichText value={b.text} onChange={(text) => set(i, { ...b, text })} />
              <Input value={b.cite} onChange={(x) => set(i, { ...b, cite: x.target.value })} placeholder="القائل أو المصدر (اختياري)" />
            </>
          )}
          {b.t === 'note' && (
            <>
              <Segmented value={b.tone} onChange={(tone) => set(i, { ...b, tone })} options={[{ value: 'gold', label: 'بارز' }, { value: 'info', label: 'هادئ' }]} />
              <RichText value={b.text} onChange={(text) => set(i, { ...b, text })} />
            </>
          )}
          {b.t === 'img' && (
            <>
              <MediaPicker value={b.mediaId || null} onChange={(id) => set(i, { ...b, mediaId: id ?? '' })} library={media} label="الصورة" />
              <Input value={b.caption} onChange={(x) => set(i, { ...b, caption: x.target.value })} placeholder="تعليق تحت الصورة (اختياري)" />
            </>
          )}
          {b.t === 'video' && (
            <>
              <Input dir="ltr" value={b.url} onChange={(x) => set(i, { ...b, url: x.target.value })} placeholder="https://…/video.mp4" />
              <Input value={b.caption} onChange={(x) => set(i, { ...b, caption: x.target.value })} placeholder="تعليق (اختياري)" />
            </>
          )}
          {b.t === 'hr' && <hr className={e.hr} />}
        </div>
      ))}
      <div className={e.add} role="group" aria-label="إضافة كتلة">
        {ADD.map((t) => <button key={t} type="button" onClick={() => insert(value.length, t)}>+ {BLOCK_LABEL[t]}</button>)}
      </div>
    </div>
  )
}
