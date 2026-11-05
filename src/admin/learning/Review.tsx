'use client'
/* بطاقات المراجعة: قبول الواجب أو طلب تعديله، والإجابة عن سؤال متدرب */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { answerQuestion, reviewSubmission, setAttendance } from './actions'
import r from './review.module.css'

export function SubmissionReview({ id, status, feedback: initial }: { id: string; status: string; feedback: string }) {
  const router = useRouter()
  const [feedback, setFeedback] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const go = async (st: 'accepted' | 'revise') => {
    setBusy(true); setErr('')
    const res = await reviewSubmission({ id, status: st, feedback })
    setBusy(false)
    if (!res.ok) setErr(res.error ?? 'تعذّر الحفظ'); else router.refresh()
  }
  return (
    <div className={r.form}>
      <textarea className={r.text} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="ملاحظاتك للمتدرب" aria-label="ملاحظات المراجعة" />
      <div className={r.actions}>
        <button className="btn" disabled={busy || status === 'accepted'} onClick={() => go('accepted')}>قبول</button>
        <button className="btn ghost" disabled={busy} onClick={() => go('revise')}>طلب تعديل</button>
        {err && <span className={r.err} role="alert">{err}</span>}
      </div>
    </div>
  )
}

export function AnswerBox({ id, answer: initial }: { id: string; answer: string }) {
  const router = useRouter()
  const [answer, setAnswer] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  return (
    <div className={r.form}>
      <textarea className={r.text} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="إجابتك — تظهر تحت الدرس للمتدرب" aria-label="الإجابة" />
      <div className={r.actions}>
        <button className="btn" disabled={busy || !answer.trim()} onClick={async () => {
          setBusy(true); setErr('')
          const res = await answerQuestion({ id, answer })
          setBusy(false)
          if (!res.ok) setErr(res.error ?? 'تعذّر الحفظ'); else router.refresh()
        }}>{initial ? 'تحديث الإجابة' : 'أرسل الإجابة'}</button>
        {err && <span className={r.err} role="alert">{err}</span>}
      </div>
    </div>
  )
}

export function AttendToggle({ learnerId, lessonId, present }: { learnerId: string; lessonId: string; present: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <button className={r.toggle} aria-pressed={present} disabled={busy} onClick={async () => {
      setBusy(true)
      await setAttendance(learnerId, lessonId, !present)
      setBusy(false)
      router.refresh()
    }}>{present ? '✓ حاضر' : 'غائب'}</button>
  )
}
