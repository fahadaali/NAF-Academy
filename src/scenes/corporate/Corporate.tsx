'use client'
/* للمؤسسات — نموذج متدرّج برقائق اختيار، يتقدّم سؤالاً سؤالاً بلا صفحة جديدة. */
import { useState } from 'react'
import { corporateRequest } from '@/site/corporate-actions'
import { Words } from '@/components/Words'
import styles from './Corporate.module.css'

type Props = { title: string; body: string; sizes: string[]; interests: string[]; eyebrow?: string }

export function Corporate({ title, body, sizes, interests, eyebrow = '' }: Props) {
  const [size, setSize] = useState<string>('')
  const [picked, setPicked] = useState<string[]>([])
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const toggle = (x: string) => setPicked((p) => (p.includes(x) ? p.filter((y) => y !== x) : [...p, x]))
  const step = sent ? 3 : !size ? 0 : picked.length === 0 ? 1 : 2

  return (
    <section id="corporate" className={styles.corp} aria-labelledby="corp-title">
      <div className={`wrap ${styles.grid}`}>
        <div className={styles.intro}>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <Words as="h2" id="corp-title" text={title} className="scene-title" />
          <p className={`statement reveal ${styles.body}`}>{body}</p>
          <ol role="list" className={styles.steps} aria-hidden="true">
            {['حجم الفريق', 'مجالات الاهتمام', 'بيانات التواصل'].map((s, i) => (
              <li key={s} data-on={i <= step ? '1' : '0'}><span className="num">{i + 1}</span>{s}</li>
            ))}
          </ol>
        </div>

        <form
          className={`reveal ${styles.form}`}
          onSubmit={async (e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            setBusy(true); setErr('')
            const r = await corporateRequest({ name: f.get('name'), org: f.get('org'), contact: f.get('contact'), size, interests: picked, website: f.get('website') ?? '' }).catch(() => ({ ok: false, error: 'تعذّر الإرسال — حاول مجدداً' }))
            setBusy(false)
            if (r.ok) setSent(true); else setErr(r.error ?? 'تعذّر الإرسال')
          }}
          data-sent={sent ? '1' : '0'}
        >
          <fieldset className={styles.field}>
            <legend>كم عدد أعضاء إدارتك القانونية؟</legend>
            <div className={styles.chips}>
              {sizes.map((s) => (
                <label key={s} className={styles.chip} data-on={size === s ? '1' : '0'}>
                  <input type="radio" name="size" value={s} checked={size === s} onChange={() => setSize(s)} />
                  <span className="num">{s}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className={styles.field} data-open={size ? '1' : '0'}>
            <legend>ما المجالات التي تهمّكم؟</legend>
            <div className={styles.chips}>
              {interests.map((x) => (
                <label key={x} className={styles.chip} data-on={picked.includes(x) ? '1' : '0'}>
                  <input type="checkbox" checked={picked.includes(x)} onChange={() => toggle(x)} />
                  <span>{x}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className={styles.field} data-open={picked.length ? '1' : '0'}>
            <legend>كيف نتواصل معك؟</legend>
            <div className={styles.inputs}>
              <label><span>الاسم</span><input required name="name" autoComplete="name" /></label>
              <label><span>الجهة</span><input required name="org" autoComplete="organization" /></label>
              <label><span>البريد أو الجوال</span><input required name="contact" autoComplete="email" dir="ltr" /></label>
            </div>
            <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className={styles.trap} />
            {err && <p className={styles.err} role="alert">{err}</p>}
            <button className="btn" type="submit" disabled={busy}>{busy ? 'جارٍ الإرسال…' : 'أرسل الطلب'}</button>
          </fieldset>

          <div className={styles.done} role="status" aria-live="polite">
            {sent && (
              <>
                <svg viewBox="0 0 52 52" width="64" height="64" aria-hidden="true"><circle cx="26" cy="26" r="24" /><path d="M15 27l7 7 15-15" /></svg>
                <strong>وصلنا طلبك</strong>
                <span>سيتواصل معك فريق الأكاديمية خلال يوم عمل.</span>
              </>
            )}
          </div>
        </form>
      </div>
    </section>
  )
}
