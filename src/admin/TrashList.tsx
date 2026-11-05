'use client'
import { useState, useTransition } from 'react'
import { purge, restore, type Entity } from '@/admin/actions'
import p from '@/admin/ui/panel.module.css'

type Item = { id: string; name: string; at: string | null; entity: Entity; label: string }

export function TrashList({ items }: { items: Item[] }) {
  const [list, setList] = useState(items)
  const [, start] = useTransition()
  if (!list.length) return <div className={p.empty}>سلة المحذوفات فارغة.</div>
  const drop = (it: Item) => setList((l) => l.filter((x) => !(x.id === it.id && x.entity === it.entity)))
  return (
    <table className={p.table}>
      <thead><tr><th>العنصر</th><th>النوع</th><th>حُذف</th><th /></tr></thead>
      <tbody>
        {list.map((it) => (
          <tr key={it.entity + it.id}>
            <td><strong>{it.name || '—'}</strong></td>
            <td className={p.muted}>{it.label}</td>
            <td className={`${p.muted} num`}>{it.at ? new Date(it.at).toLocaleString('ar-SA-u-nu-latn', { timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short' }) : ''}</td>
            <td>
              <div className={p.cellRow} style={{ justifyContent: 'end', gap: 4 }}>
                <button className={p.iconBtn} onClick={() => { drop(it); start(() => restore(it.entity, it.id)) }}>استرجاع</button>
                <button className={`${p.iconBtn} ${p.danger}`} onClick={() => {
                  const c = prompt(`حذف «${it.name}» نهائياً لا يمكن التراجع عنه.\nاكتب كلمة: حذف`)
                  if (c !== 'حذف') return
                  start(async () => {
                    const r = await purge(it.entity, it.id, c)
                    if (r.ok) drop(it); else alert(r.error)
                  })
                }}>حذف نهائي</button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
