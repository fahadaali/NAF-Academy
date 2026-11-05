'use client'
import { useState } from 'react'
import { setOptoutByToken } from './unsubscribe-actions'

export function UnsubscribeForm({ token, initial }: { token: string; initial: boolean }) {
  const [out, setOut] = useState(initial)
  const [busy, setBusy] = useState(false)
  const go = async (v: boolean) => { setBusy(true); const r = await setOptoutByToken(token, v); setBusy(false); if (r.ok) setOut(v) }
  return (
    <div style={{ display: 'grid', gap: 14, justifyItems: 'start' }} aria-live="polite">
      {out ? (
        <>
          <p><strong>أُوقفت رسائل التحفيز والعروض.</strong> تبقى رسائل التسجيل وتذكيرات الجلسات لأنها جزء من دوراتك.</p>
          <button className="btn ghost" disabled={busy} onClick={() => go(false)}>أعدني إلى القائمة</button>
        </>
      ) : (
        <>
          <p>ستتوقف رسائل التحفيز والعروض وفتح التسجيل. تبقى رسائل التسجيل وتذكيرات الجلسات.</p>
          <button className="btn" disabled={busy} onClick={() => go(true)}>إيقاف هذه الرسائل</button>
        </>
      )}
    </div>
  )
}
