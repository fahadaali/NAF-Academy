'use client'
/* لوحة الشهادات — تحديد واعتماد جماعي، ورفض أو إلغاء بسبب مكتوب، وإعادة فحص دورة */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Criterion } from '@/lib/certificate'
import { approveCertificates, recheck, regenerateCertificate, rejectCertificate, reopenCertificate, revokeCertificate } from './actions'
import p from '@/admin/ui/panel.module.css'
import b from './board.module.css'

export type BoardRow = { id: string; name: string; email: string; course: string; status: string; code: string | null; criteria: Criterion[]; when: string; reason: string; by: string | null }

export function Board({ rows, status, empty }: { rows: BoardRow[]; status: string; empty: string }) {
  const router = useRouter()
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const all = rows.length > 0 && sel.size === rows.length
  const toggle = (id: string) => setSel((s0) => { const s1 = new Set(s0); if (s1.has(id)) s1.delete(id); else s1.add(id); return s1 })
  const run = async (f: () => Promise<{ ok: boolean; error?: string; n?: number }>, ok: string) => {
    setBusy(true); setMsg('')
    const r = await f()
    setBusy(false)
    setMsg(r.ok ? ok.replace('{n}', String(r.n ?? '')) : r.error ?? 'تعذّر')
    setSel(new Set())
    router.refresh()
  }
  const reason = (q: string) => { const x = prompt(q)?.trim(); return x && x.length >= 3 ? x : null }

  return (
    <>
      {status === 'pending' && rows.length > 0 && (
        <div className={b.bulk}>
          <label><input type="checkbox" checked={all} onChange={() => setSel(all ? new Set() : new Set(rows.map((r) => r.id)))} /> تحديد الكل</label>
          <button className="btn" disabled={busy || !sel.size} onClick={() => run(() => approveCertificates([...sel]), 'اعتُمدت {n} شهادة')}>اعتماد المحدد ({sel.size})</button>
          {msg && <span role="status" className={p.muted}>{msg}</span>}
        </div>
      )}
      {(status !== 'pending' || !rows.length) && msg && <p role="status" className={p.muted}>{msg}</p>}
      {!rows.length && <div className={p.empty}>{empty}</div>}
      <div className={b.list}>
        {rows.map((r) => (
          <article key={r.id} className={b.card} data-sel={sel.has(r.id) ? '1' : '0'}>
            <div className={b.head}>
              {status === 'pending' && <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} aria-label={`تحديد ${r.name}`} />}
              <div className={b.who}><strong>{r.name}</strong><small dir="ltr">{r.email}</small></div>
              <div className={b.course}>{r.course}<small className="num">{r.when}{r.by ? ` · ${r.by}` : ''}</small></div>
            </div>
            <ul className={b.criteria} role="list">
              {r.criteria.map((c) => <li key={c.key} data-met={c.met ? '1' : '0'}><span aria-hidden="true">{c.met ? '✓' : '✕'}</span>{c.label} <small className="num">({c.detail})</small></li>)}
            </ul>
            {r.reason && <p className={b.reason}>السبب: {r.reason}</p>}
            <div className={b.actions}>
              {r.status === 'pending' && (
                <>
                  <button className="btn" disabled={busy} onClick={() => run(() => approveCertificates([r.id]), 'اعتُمدت')}>اعتماد</button>
                  <button className={p.iconBtn} disabled={busy} onClick={() => { const x = reason('سبب الرفض (يظهر للمتدرب)'); if (x) run(() => rejectCertificate({ id: r.id, reason: x }), 'رُفضت') }}>رفض</button>
                </>
              )}
              {r.status === 'issued' && (
                <>
                  <a className={p.iconBtn} href={`/certificates/${r.code}`} target="_blank" rel="noreferrer">صفحة التحقق ↗</a>
                  <a className={p.iconBtn} href={`/certificates/${r.code}/pdf`} target="_blank" rel="noreferrer">PDF</a>
                  <button className={p.iconBtn} disabled={busy} onClick={() => run(async () => ({ ...(await regenerateCertificate(r.id)) }), 'أُعيد توليد الملف')}>إعادة توليد الملف</button>
                  <button className={`${p.iconBtn} ${p.danger}`} disabled={busy} onClick={() => { const x = reason('سبب الإلغاء (يظهر في صفحة التحقق)'); if (x) run(() => revokeCertificate({ id: r.id, reason: x }), 'أُلغيت') }}>إلغاء الشهادة</button>
                </>
              )}
              {r.status === 'rejected' && <button className={p.iconBtn} disabled={busy} onClick={() => run(() => reopenCertificate(r.id), 'أُعيدت للمراجعة')}>إعادة للمراجعة</button>}
            </div>
          </article>
        ))}
      </div>
    </>
  )
}

export function Recheck({ courses }: { courses: { id: string; title: string }[] }) {
  const router = useRouter()
  const [c, setC] = useState(courses[0]?.id ?? '')
  const [msg, setMsg] = useState('')
  return (
    <span className={b.recheck}>
      <select value={c} onChange={(e) => setC(e.target.value)} aria-label="الدورة">{courses.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select>
      <button className="btn ghost" disabled={!c} onClick={async () => { setMsg('…'); const r = await recheck(c); setMsg(`${r.n} مستوفٍ جديد`); router.refresh() }}>أعد فحص الدورة</button>
      {msg && <span role="status" className={p.muted}>{msg}</span>}
    </span>
  )
}
