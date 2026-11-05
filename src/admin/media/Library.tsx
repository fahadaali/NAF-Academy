'use client'
/* مكتبة الصور — رفع متعدد، ونص بديل، ونقطة تركيز بالنقر مع معاينة القص بثلاث نسب. */
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Media } from '@/server/db/schema'
import { trash, updateMedia, uploadMedia } from '@/admin/actions'
import { Field, Input, PageHead } from '@/admin/ui/kit'
import { urlOf } from '@/admin/ui/MediaPicker'
import s from './library.module.css'
import { useCan } from '@/admin/ui/perms'

export function Library({ items }: { items: Media[] }) {
  const write = useCan()('content.write')
  const router = useRouter()
  const params = useSearchParams()
  const [sel, setSel] = useState<string | null>(params.get('focus') ?? items[0]?.id ?? null)
  const [draft, setDraft] = useState<Record<string, { alt: string; focalX: number; focalY: number }>>({})
  const [busy, setBusy] = useState(0)
  const [error, setError] = useState('')
  const cur = items.find((m) => m.id === sel)
  const d = cur ? draft[cur.id] ?? { alt: cur.alt, focalX: cur.focalX, focalY: cur.focalY } : null
  const changed = cur && d && (d.alt !== cur.alt || d.focalX !== cur.focalX || d.focalY !== cur.focalY)

  const upload = async (files: FileList) => {
    setError('')
    setBusy(files.length)
    let last: string | undefined
    for (const f of Array.from(files)) {
      const fd = new FormData()
      fd.set('file', f)
      const r = await uploadMedia(fd)
      if (!r.ok) setError(`${f.name}: ${r.error}`)
      else last = r.id
      setBusy((b) => b - 1)
    }
    if (last) setSel(last)
    router.refresh()
  }

  return (
    <>
      <PageHead title="مكتبة الصور" sub={`${items.length} صورة${write ? ' — انقر على الصورة لتحديد نقطة التركيز' : ''}`} actions={!write ? null :
        <label className="btn" aria-disabled={busy > 0} style={{ cursor: 'pointer' }}>
          {busy ? `جارٍ رفع ${busy}…` : 'رفع صور'}
          <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" hidden onChange={(e) => e.target.files?.length && upload(e.target.files)} />
        </label>
      } />
      {error && <p className={s.error}>{error}</p>}
      <div className={s.layout}>
        <div className={s.grid}>
          {items.length === 0 && <div className={s.none}>ارفع أول صورة — الغلاف وصور المدربين والمسارات تُختار من هنا.</div>}
          {items.map((m) => (
            <button key={m.id} className={s.tile} aria-pressed={m.id === sel} onClick={() => setSel(m.id)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urlOf(m)} alt={m.alt} loading="lazy" style={{ objectPosition: `${m.focalX}% ${m.focalY}%` }} />
            </button>
          ))}
        </div>
        {cur && d && (
          <aside className={s.panel}>
            <div
              className={s.focal}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                const x = Math.round(((e.clientX - r.left) / r.width) * 100)
                const y = Math.round(((e.clientY - r.top) / r.height) * 100)
                setDraft((o) => ({ ...o, [cur.id]: { ...d, focalX: x, focalY: y } }))
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urlOf(cur)} alt="" />
              <span className={s.dot} style={{ left: `${d.focalX}%`, top: `${d.focalY}%` }} />
            </div>
            <div className={s.crops}>
              {['16 / 9', '3 / 4', '1 / 1'].map((r) => (
                <div key={r} className={s.crop} style={{ aspectRatio: r }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urlOf(cur)} alt="" style={{ objectPosition: `${d.focalX}% ${d.focalY}%` }} />
                  <span>{r.replace(/ /g, '')}</span>
                </div>
              ))}
            </div>
            <Field label="النص البديل" hint="وصف الصورة لقارئ الشاشة ومحركات البحث">
              <Input value={d.alt} onChange={(e) => setDraft((o) => ({ ...o, [cur.id]: { ...d, alt: e.target.value } }))} />
            </Field>
            <p className={`${s.meta} num`}>{cur.width}×{cur.height} · {Math.round(cur.size / 1024)} ك.ب · {cur.mime.replace('image/', '')}</p>
            <div className={s.actions}>
              {write && <button className="btn" disabled={!changed} onClick={async () => { await updateMedia(cur.id, d); router.refresh() }}>حفظ</button>}
              {write && <button className="btn ghost" onClick={async () => {
                if (!confirm('نقل الصورة إلى المحذوفات؟ ستختفي من أي دورة تستخدمها.')) return
                await trash('media', cur.id)
                setSel(null)
                router.refresh()
              }}>حذف</button>}
            </div>
          </aside>
        )}
      </div>
    </>
  )
}
