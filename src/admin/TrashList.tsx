'use client'
import { useState, useTransition } from 'react'
import { purge, restore, type Entity } from '@/admin/actions'
import p from '@/admin/ui/panel.module.css'
import { useCan } from '@/admin/ui/perms'
import { TRASH_OWNER } from '@/admin/trash-perms'

type Item = { id: string; name: string; at: string | null; entity: Entity; label: string }

export function TrashList({ items }: { items: Item[] }) {
  const can = useCan()
  const [list, setList] = useState(items)
  const [, start] = useTransition()
  if (!list.length) return <div className={p.empty}>سلة المحذوفات فارغة.</div>
  const drop = (it: Item) => setList((l) => l.filter((x) => !(x.id === it.id && x.entity === it.entity)))
  return (
    <div className={p.scroll}><table className={p.table}>
      <thead><tr><th>العنصر</th><th>النوع</th><th>حُذف</th><th /></tr></thead>
      <tbody>
        {list.map((it) => (
          <tr key={it.entity + it.id}>
            <td><strong>{it.name || '—'}</strong></td>
            <td className={p.muted}>{it.label}</td>
            <td className={`${p.muted} num`}>{it.at ? new Date(it.at).toLocaleString('ar-SA-u-nu-latn', { timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short' }) : ''}</td>
            <td>
              <div className={`${p.cellRow} ${p.tools}`}>
                {can(TRASH_OWNER[it.entity]) && <button className={p.iconBtn} onClick={() => { drop(it); start(async () => { const r = await restore(it.entity, it.id); if (!r.ok) alert(r.error) }) }}>استرجاع</button>}
                {can('trash.purge') && <button className={`${p.iconBtn} ${p.danger}`} onClick={() => {
                  const c = prompt(`حذف «${it.name}» نهائياً لا يمكن التراجع عنه.\nاكتب كلمة: حذف`)
                  if (c !== 'حذف') return
                  start(async () => {
                    const r = await purge(it.entity, it.id, c)
                    if (r.ok) drop(it); else alert(r.error)
                  })
                }}>حذف نهائي</button>}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table></div>
  )
}
