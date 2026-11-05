'use client'
/* اختيار صورة من المكتبة أو رفع جديدة — في نافذة <dialog> أصلية. */
import { useRef, useState } from 'react'
import type { Media } from '@/server/db/schema'
import { listMedia, uploadMedia } from '@/admin/actions'
import styles from './media.module.css'
import { useCan } from './perms'

export const urlOf = (m: Pick<Media, 'key'>) => `/media/${m.key}`

export function MediaPicker({ value, onChange, library, ratio = '16 / 9', label = 'الصورة', accept }: {
  value: string | null
  onChange: (id: string | null) => void
  library: Media[]
  ratio?: string
  label?: string
  /** الصيغ المقبولة (مثل PNG للشعارات) — المكتبة والرفع يتقيّدان بها */
  accept?: string[]
}) {
  const dlg = useRef<HTMLDialogElement>(null)
  const canUpload = useCan()('content.write')
  const only = (list: Media[]) => (accept ? list.filter((m) => accept.includes(m.mime)) : list)
  const [items, setItems] = useState(() => only(library))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const current = items.find((m) => m.id === value)

  const open = async () => {
    dlg.current?.showModal()
    setItems(only(await listMedia()))
  }
  const upload = async (f: File) => {
    setBusy(true)
    setError('')
    const fd = new FormData()
    fd.set('file', f)
    const r = await uploadMedia(fd)
    setBusy(false)
    if (!r.ok) return setError(r.error ?? 'تعذّر الرفع')
    const list = only(await listMedia())
    setItems(list)
    onChange(r.id!)
    dlg.current?.close()
  }

  return (
    <div className={styles.picker}>
      <button type="button" className={styles.slot} style={{ aspectRatio: ratio }} onClick={open} aria-label={`${label}: اختيار`}>
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={urlOf(current)} alt={current.alt} style={{ objectPosition: `${current.focalX}% ${current.focalY}%` }} />
        ) : (
          <span>+ اختر {label} أو ارفعها</span>
        )}
      </button>
      {value && (
        <div className={styles.slotTools}>
          <button type="button" onClick={open}>تغيير</button>
          <button type="button" onClick={() => onChange(null)}>إزالة</button>
          {current ? <a href={`/admin/media?focus=${current.id}`} target="_blank" rel="noreferrer">ضبط نقطة التركيز ↗</a> : <span>الصورة لم تعد في المكتبة</span>}
        </div>
      )}

      <dialog ref={dlg} className={styles.dialog} onClick={(e) => e.target === dlg.current && dlg.current?.close()}>
        <div className={styles.dlgHead}>
          <strong>مكتبة الصور</strong>
          {canUpload && <label className={`btn ${styles.up}`} aria-disabled={busy}>
            {busy ? 'جارٍ الرفع…' : 'رفع صورة'}
            <input type="file" accept={(accept ?? ['image/jpeg', 'image/png', 'image/webp', 'image/avif']).join(',')} hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>}
          <button type="button" className={styles.close} onClick={() => dlg.current?.close()} aria-label="إغلاق">✕</button>
        </div>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.lib}>
          {items.length === 0 && <p className={styles.none}>لا صور بعد — ارفع أول صورة.</p>}
          {items.map((m) => (
            <button type="button" key={m.id} className={styles.tile} aria-pressed={m.id === value} onClick={() => { onChange(m.id); dlg.current?.close() }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urlOf(m)} alt={m.alt} loading="lazy" style={{ objectPosition: `${m.focalX}% ${m.focalY}%` }} />
              <span>{m.alt}</span>
            </button>
          ))}
        </div>
      </dialog>
    </div>
  )
}
