'use client'
/* خطأ غير متوقع في صفحة عامة — رسالة هادئة وإعادة محاولة، والرقم المرجعي للدعم */
import { useEffect } from 'react'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <section className="wrap" role="alert" style={{ minBlockSize: '64svh', display: 'grid', placeContent: 'center', justifyItems: 'center', gap: 16, textAlign: 'center', paddingBlock: 'calc(var(--header-h) + 50px) 90px' }}>
      <h1 className="scene-title">تعثّرت الصفحة.</h1>
      <p style={{ color: 'var(--muted)', maxInlineSize: '44ch', lineHeight: 1.9 }}>حدث خطأ غير متوقع. أعد المحاولة، وإن تكرر فتواصل معنا وأرفق الرقم أدناه.</p>
      {error.digest && <code dir="ltr" style={{ fontSize: 13, color: 'var(--muted)' }}>{error.digest}</code>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn" onClick={reset}>أعد المحاولة</button>
        <a className="btn ghost" href="/">الرئيسية</a>
      </div>
    </section>
  )
}
