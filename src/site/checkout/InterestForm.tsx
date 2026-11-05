'use client'
/* نموذج الاهتمام — «أبلغني عند الفتح»، وقائمة الانتظار، والدفعة القادمة، وفتح التسجيل الإلكتروني. */
import { useState } from 'react'
import { interestAction } from '@/site/actions'
import { Words } from '@/components/Words'
import s from './checkout.module.css'

type Kind = 'notify_open' | 'waitlist' | 'next_cohort' | 'register'
const COPY: Record<Kind, { title: string; body: string; cta: string }> = {
  notify_open: { title: 'أبلغني عند الفتح', body: 'نرسل لك فور فتح التسجيل، قبل الإعلان العام.', cta: 'أبلغني' },
  waitlist: { title: 'انضم لقائمة الانتظار', body: 'اكتمل العدد. إن تفرّغ مقعد فأنت أول من نبلغه.', cta: 'أضفني للقائمة' },
  next_cohort: { title: 'أبلغني بالدفعة القادمة', body: 'انتهى تسجيل هذه الدفعة. نبلغك حين تُعلن التالية.', cta: 'أبلغني' },
  register: { title: 'سجّل اهتمامك', body: 'التسجيل الإلكتروني يُفتح قريباً. اترك بياناتك ونبلغك أولاً.', cta: 'سجّل اهتمامي' },
}

export function InterestForm({ slug, kind }: { slug: string; kind: Kind }) {
  const c = COPY[kind]
  const [v, setV] = useState({ name: '', email: '', phone: '' })
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const [error, setError] = useState('')
  return (
    <section className={s.step} style={{ maxInlineSize: 620 }}>
      {state === 'done' ? (
        <div style={{ display: 'grid', gap: 10, justifyItems: 'center', textAlign: 'center', padding: '20px 0' }}>
          <Words as="h2" text="سجّلن~3اك، وسنبلغك." className="scene-title" />
          <p className={s.hint}>ستصلك رسالة على {v.email}</p>
        </div>
      ) : (
        <>
          <h2>{c.title}</h2>
          <p className={s.hint}>{c.body}</p>
          <div className={s.fields}>
            <label className={s.field}><span>الاسم</span><input className={s.input} autoComplete="name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
            <label className={s.field}><span>البريد</span><input className={s.input} dir="ltr" type="email" autoComplete="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></label>
            <label className={s.field}><span>الجوال (اختياري)</span><input className={s.input} dir="ltr" type="tel" autoComplete="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></label>
          </div>
          {error && <p className={s.err} role="alert">{error}</p>}
          <button className="btn" style={{ justifySelf: 'start' }} disabled={state === 'busy'} onClick={async () => {
            setState('busy'); setError('')
            const r = await interestAction(slug, { kind, ...v })
            if (r.ok) setState('done'); else { setState('idle'); setError(r.error ?? 'تعذّر الحفظ') }
          }}>{state === 'busy' ? 'لحظة…' : c.cta}</button>
        </>
      )}
    </section>
  )
}
