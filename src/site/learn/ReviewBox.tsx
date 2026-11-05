'use client'
/* تقييم الدورة من مساحة التعلّم — نجوم بلوحة المفاتيح (أزرار راديو)، وتعليق اختياري، وإخفاء الاسم */
import { useState } from 'react'
import { submitReview } from '@/site/review-actions'
import st from './course.module.css'

export function ReviewBox({ courseId, initial }: { courseId: string; initial: { rating: number; comment: string; status: string } | null }) {
  const [rating, setRating] = useState(initial?.rating ?? 0)
  const [comment, setComment] = useState(initial?.comment ?? '')
  const [anon, setAnon] = useState(false)
  const [msg, setMsg] = useState(initial ? (initial.status === 'approved' ? 'نُشر تقييمك — شكراً لك' : 'تقييمك قيد المراجعة') : '')
  const [busy, setBusy] = useState(false)
  return (
    <form className={st.review} onSubmit={async (e) => {
      e.preventDefault()
      setBusy(true)
      const r = await submitReview(courseId, { rating, comment, anonymous: anon })
      setBusy(false)
      setMsg(r.ok ? 'وصل تقييمك — يُنشر بعد المراجعة' : r.error ?? 'تعذّر')
    }}>
      <fieldset className={st.starsIn}>
        <legend>كم تقيّم الدورة؟</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} data-on={n <= rating ? '1' : '0'}>
            <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} />
            <span aria-hidden="true">★</span><span className="sr-only">{n} من 5</span>
          </label>
        ))}
      </fieldset>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} maxLength={1200} placeholder="ما الذي أفادك؟ وما الذي نحسّنه؟ (اختياري)" aria-label="تعليقك" />
      <label className={st.anon}><input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} /> انشره بلا اسمي</label>
      <div className={st.reviewFoot}>
        <button className="btn" disabled={busy || !rating}>{initial ? 'حدّث التقييم' : 'أرسل التقييم'}</button>
        {msg && <span role="status">{msg}</span>}
      </div>
    </form>
  )
}
