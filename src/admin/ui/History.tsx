'use client'
/* درج «السجل» في المحرّرات — النسخ المحفوظة (من، متى، الملخص)، ومقارنة حقلاً حقلاً مع ما في المحرّر الآن،
   و«استرجاع» يحمّل النسخة في المحرّر تعديلاً غير محفوظ — فيمرّ بالحفظ العادي وتحقّقه وتأكيداته. */
import { useState } from 'react'
import { getVersion, listVersions, type Version } from '@/admin/history'
import { when } from '@/admin/sales/labels'
import h from './history.module.css'

type Props<T> = {
  entity: string
  id: string
  current: T
  onRestore: (snapshot: T) => void
  /** أسماء الحقول بالعربية للمقارنة — غير المسمّى يظهر بمفتاحه */
  labels?: Record<string, string>
}

const ACTION: Record<string, string> = { create: 'إنشاء', update: 'تعديل', duplicate: 'نسخ' }

export function History<T extends object>({ entity, id, current, onRestore, labels = {} }: Props<T>) {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<Version[] | null>(null)
  const [pick, setPick] = useState<{ v: Version; snap: T } | null>(null)
  const [err, setErr] = useState('')

  const show = async () => {
    setOpen(true)
    setPick(null)
    setList(await listVersions(entity, id))
  }
  const view = async (v: Version) => {
    setErr('')
    const r = await getVersion(v.id)
    if (!r.ok) return setErr(r.error)
    setPick({ v, snap: { ...current, ...(r.snapshot as T) } })
  }
  const diff = pick ? Object.keys({ ...current, ...pick.snap }).filter((k) => JSON.stringify((current as Record<string, unknown>)[k]) !== JSON.stringify((pick.snap as Record<string, unknown>)[k])) : []
  const brief = (x: unknown) => {
    const s = typeof x === 'string' ? x : JSON.stringify(x)
    return !s ? '—' : s.length > 140 ? `${s.slice(0, 140)}…` : s
  }

  return (
    <>
      <button type="button" className="btn ghost" onClick={show}>السجل</button>
      {open && (
        <div className={h.drawer} role="dialog" aria-modal="true" aria-label="سجل النسخ">
          <div className={h.head}>
            <strong>سجل النسخ</strong>
            <button type="button" className={h.x} onClick={() => setOpen(false)} aria-label="إغلاق">✕</button>
          </div>
          {!pick ? (
            list === null ? <p className={h.muted}>يُحمَّل…</p> : list.length === 0 ? <p className={h.muted}>لا نسخ محفوظة بعد — يُحفظ السجل مع كل حفظ.</p> : (
              <ol className={h.list} role="list">
                {list.map((v, i) => (
                  <li key={v.id}>
                    <button type="button" onClick={() => view(v)}>
                      <span><strong>{ACTION[v.action] ?? v.action}</strong> · {v.actor}{i === 0 && <em className={h.now}>الأحدث</em>}</span>
                      <small className="num">{when(v.at)}</small>
                      {v.summary && <small>{v.summary}</small>}
                    </button>
                  </li>
                ))}
              </ol>
            )
          ) : (
            <div className={h.view}>
              <button type="button" className={h.back} onClick={() => setPick(null)}>← كل النسخ</button>
              <p className={h.muted}>نسخة <span className="num">{when(pick.v.at)}</span> — {pick.v.actor}</p>
              {diff.length === 0 ? <p>مطابقة لما في المحرّر الآن.</p> : (
                <>
                  <p className={h.muted}>يختلف عن المحرّر في <span className="num">{diff.length}</span> حقل:</p>
                  <table className={h.diff}>
                    <thead><tr><th>الحقل</th><th>في النسخة</th><th>الآن</th></tr></thead>
                    <tbody>
                      {diff.map((k) => (
                        <tr key={k}>
                          <th scope="row">{labels[k] ?? k}</th>
                          <td>{brief((pick.snap as Record<string, unknown>)[k])}</td>
                          <td>{brief((current as Record<string, unknown>)[k])}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button type="button" className="btn" onClick={() => { onRestore(pick.snap); setOpen(false) }}>استرجاع هذه النسخة إلى المحرّر</button>
                  <p className={h.muted}>تظهر في المحرّر تعديلاً غير محفوظ — راجعها ثم احفظ.</p>
                </>
              )}
            </div>
          )}
          {err && <p className={h.err} role="alert">{err}</p>}
        </div>
      )}
    </>
  )
}
