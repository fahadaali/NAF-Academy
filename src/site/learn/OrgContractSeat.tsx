'use client'
/* مسؤول المؤسسة: تخصيص مقعد من عقد مؤسسته — البريد والاسم والدورة (ودفعتها إن كانت لها دفعات). */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { assignOrgContractSeat } from '@/site/org-actions'
import st from './learn.module.css'

type Course = { id: string; title: string; cohorts: { id: string; title: string }[] }

export function OrgContractSeat({ orgId, contractId, courses }: { orgId: string; contractId: string; courses: Course[] }) {
  const router = useRouter()
  const [courseId, setCourseId] = useState(courses.length === 1 ? courses[0].id : '')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const cohorts = courses.find((c) => c.id === courseId)?.cohorts ?? []
  return (
    <form className={st.seat} onSubmit={async (e) => {
      e.preventDefault()
      const f = new FormData(e.currentTarget)
      setBusy(true); setMsg('')
      const r = await assignOrgContractSeat(orgId, contractId, { email: String(f.get('email')), name: String(f.get('name')), courseId, cohortId: String(f.get('cohort') ?? '') || null })
      setBusy(false)
      if (r.ok) { e.currentTarget.reset(); router.refresh() } else setMsg(r.error ?? 'تعذّر')
    }}>
      <input name="email" type="email" dir="ltr" required placeholder="بريد الموظف" aria-label="بريد الموظف" />
      <input name="name" placeholder="الاسم" aria-label="اسم الموظف" />
      <select aria-label="الدورة" value={courseId} onChange={(e) => setCourseId(e.target.value)} required>
        <option value="">— الدورة —</option>
        {courses.map((c) => <option key={c.id} value={c.id}>{c.title.replace(/~\d/g, '')}</option>)}
      </select>
      {cohorts.length > 0 && (
        <select name="cohort" aria-label="الدفعة" required>
          <option value="">— الدفعة —</option>
          {cohorts.map((k) => <option key={k.id} value={k.id}>{k.title}</option>)}
        </select>
      )}
      <button className="btn ghost" disabled={busy || !courseId}>خصّص</button>
      {msg && <span role="alert">{msg}</span>}
    </form>
  )
}
