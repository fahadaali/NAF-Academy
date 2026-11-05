'use client'
/* تفضيل الرسائل الاختيارية من الملف الشخصي */
import { useState } from 'react'
import { setMyOptout } from '@/site/unsubscribe-actions'
import st from './learn.module.css'

export function MailPrefs({ optedOut }: { optedOut: boolean }) {
  const [on, setOn] = useState(!optedOut)
  const [busy, setBusy] = useState(false)
  return (
    <section className={st.course} aria-labelledby="mail-prefs">
      <h2 id="mail-prefs">الرسائل</h2>
      <p>رسائل التسجيل وتذكيرات الجلسات تصلك دائماً. ويمكنك إيقاف رسائل التحفيز والعروض وفتح التسجيل.</p>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 600 }}>
        <input type="checkbox" checked={on} disabled={busy} style={{ inlineSize: 20, blockSize: 20, accentColor: 'var(--gold-3)' }}
          onChange={async (e) => { const v = e.target.checked; setOn(v); setBusy(true); const r = await setMyOptout(!v).catch(() => ({ ok: false })); setBusy(false); if (!r.ok) setOn(!v) }} />
        أرسلوا لي رسائل التحفيز والعروض
      </label>
    </section>
  )
}
