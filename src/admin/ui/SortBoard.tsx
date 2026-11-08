'use client'
/* قائمة قابلة للترتيب بالسحب — للمسارات والمدربين. الترتيب يُحفظ فوراً ويظهر في الموقع. */
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { reorder, trash, type Entity } from '@/admin/actions'
import { Badge, RowTools, useSortable } from './kit'
import p from './panel.module.css'
import { useCan } from './perms'

export type BoardItem = { id: string; title: string; sub: string; href: string; thumb?: string; glyph?: string; badge?: { tone: string; text: string } }

export function SortBoard({ items, entity }: { items: BoardItem[]; entity: Extract<Entity, 'track' | 'instructor'> }) {
  const write = useCan()('content.write')
  const [list, setList] = useState(items)
  const [, start] = useTransition()
  const { props, move } = useSortable(list, (next) => { setList(next); start(() => reorder(entity, next.map((x) => x.id))) })
  if (!list.length) return <div className={p.empty}>لا عناصر بعد.</div>
  return (
    <div className={p.scroll}><table className={p.table}>
      <tbody>
        {list.map((it, i) => (
          <tr key={it.id} {...(write ? props(i) : {})}>
            <td>
              <div className={p.cellRow}>
                <span className={p.thumb}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {it.thumb ? <img src={it.thumb} alt="" /> : it.glyph}
                </span>
                <div>
                  <Link href={it.href} className={p.rowLink}>{it.title}</Link>
                  <div className={p.muted}>{it.sub}</div>
                </div>
              </div>
            </td>
            <td>{it.badge && <Badge tone={it.badge.tone}>{it.badge.text}</Badge>}</td>
            <td className={p.shrink}>
              <div className={`${p.cellRow} ${p.tight}`}>
                <Link className={p.iconBtn} href={it.href}>{write ? 'تحرير' : 'عرض'}</Link>
                {write && <RowTools i={i} n={list.length} move={move} onRemove={() => {
                  if (!confirm(`نقل «${it.title}» إلى المحذوفات؟`)) return
                  setList((l) => l.filter((x) => x.id !== it.id))
                  start(async () => { const r = await trash(entity, it.id); if (!r.ok) alert(r.error) })
                }} />}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table></div>
  )
}
