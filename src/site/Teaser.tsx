'use client'
/* زر الفيديو التشويقي على غلاف الدورة — يفتح نافذة <dialog> أصلية، ولا يُحمَّل الفيديو إلا عند الضغط. */
import { useRef, useState } from 'react'
import s from './course.module.css'

export function Teaser({ slug, kind, label }: { slug: string; kind: 'stream' | 'url'; label: string }) {
  const dlg = useRef<HTMLDialogElement>(null)
  const [on, setOn] = useState(false)
  const src = `/courses/${slug}/teaser`
  const close = () => { dlg.current?.close(); setOn(false) }
  return (
    <>
      <button type="button" className={`rise ${s.teaserBtn}`} style={{ ['--d' as string]: 4 }} onClick={() => { setOn(true); dlg.current?.showModal() }}>
        <span className={s.teaserPlay} aria-hidden="true" />{label}
      </button>
      <dialog ref={dlg} className={s.teaserDlg} onClose={() => setOn(false)} onClick={(e) => { if (e.target === dlg.current) close() }} aria-label={label}>
        <button type="button" className={s.teaserClose} onClick={close} aria-label="إغلاق">✕</button>
        {on && (kind === 'stream'
          ? <iframe src={src} title={label} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
          : <video src={src} controls autoPlay playsInline />)}
      </dialog>
    </>
  )
}
