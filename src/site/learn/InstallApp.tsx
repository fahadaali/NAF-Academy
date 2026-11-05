'use client'
/* «ثبّت التطبيق» — يظهر حين يتيح المتصفح التثبيت، ولآيفون إرشاد «أضف إلى الشاشة الرئيسية». يختفي إن كان مثبّتاً. */
import { useEffect, useState } from 'react'
import st from './learn.module.css'

type Prompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }

export function InstallApp() {
  const [evt, setEvt] = useState<Prompt | null>(null)
  const [ios, setIos] = useState(false)
  const [hidden, setHidden] = useState(true)
  useEffect(() => {
    const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone
    if (standalone) return
    try { if (localStorage.getItem('naf-install-dismissed')) return } catch { /* خصوصية */ }
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as Prompt); setHidden(false) }
    addEventListener('beforeinstallprompt', onPrompt)
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) { setIos(true); setHidden(false) }
    return () => removeEventListener('beforeinstallprompt', onPrompt)
  }, [])
  if (hidden) return null
  const dismiss = () => { setHidden(true); try { localStorage.setItem('naf-install-dismissed', '1') } catch { /* خصوصية */ } }
  return (
    <aside className={st.install} aria-label="تثبيت التطبيق">
      <img src="/icons/icon-192.png" alt="" width={44} height={44} />
      <div>
        <strong>ثبّت الأكاديمية على جهازك</strong>
        <span>{ios ? 'من زر المشاركة ⎋ اختر «إضافة إلى الشاشة الرئيسية».' : 'وصول أسرع لدوراتك، وتنبيهات قبل الجلسات.'}</span>
      </div>
      {evt && <button className="btn" onClick={async () => { await evt.prompt(); await evt.userChoice; setEvt(null); setHidden(true) }}>ثبّت</button>}
      <button className={st.close} onClick={dismiss} aria-label="إغلاق">×</button>
    </aside>
  )
}
