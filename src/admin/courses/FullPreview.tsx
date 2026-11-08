'use client'
/* المعاينة الكاملة — الصفحة الحقيقية في إطار، بما في المحرّر قبل الحفظ (مسودة مؤقتة)، على الحاسب أو الجوال.
   تتحدّث بعد توقّف الكتابة، ولا تمسّ الدورة المحفوظة. */
import { useEffect, useRef, useState } from 'react'
import { stageCourseDraft } from '@/admin/drafts'
import type { CourseDraft } from '@/admin/schemas'
import { Segmented } from '@/admin/ui/kit'
import { timing } from '@/motion/tokens'
import f from './preview.module.css'

const DEVICES = { desktop: 1280, mobile: 390 } as const

export function FullPreview({ courseId, url, draft, onClose }: { courseId: string; url: string; draft: CourseDraft; onClose: () => void }) {
  const [device, setDevice] = useState<keyof typeof DEVICES>('desktop')
  const [rev, setRev] = useState(0)
  const [busy, setBusy] = useState(true)
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  /* ارتفاع المسرح الفعلي — شريط الأدوات يلتفّ على الجوال فلا يُفترض ارتفاعه */
  const [h, setH] = useState(0)
  const json = JSON.stringify(draft)

  /* المسودة تُحفظ بعد توقّف الكتابة ثم يُعاد تحميل الإطار */
  useEffect(() => {
    setBusy(true)
    const t = setTimeout(async () => {
      await stageCourseDraft(courseId, JSON.parse(json))
      setRev((r) => r + 1)
    }, timing.reveal)
    return () => clearTimeout(t)
  }, [courseId, json])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => { setScale(Math.min(1, (el.clientWidth - 32) / DEVICES[device])); setH(Math.max(0, el.clientHeight - 32)) }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [device])

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  }, [onClose])

  const w = DEVICES[device]
  return (
    <div className={f.overlay} role="dialog" aria-modal="true" aria-label="معاينة الصفحة كاملة">
      <div className={f.bar}>
        <strong>معاينة كاملة · قبل الحفظ</strong>
        <Segmented value={device} onChange={setDevice} options={[{ value: 'desktop', label: 'حاسب' }, { value: 'mobile', label: 'جوال' }]} />
        <span className={f.state} aria-live="polite">{busy ? 'يُحدَّث…' : 'محدَّثة'}</span>
        <a className="btn ghost" href={`${url}?draft=1`} target="_blank" rel="noreferrer">في نافذة ↗</a>
        <button type="button" className="btn" onClick={onClose}>إغلاق</button>
      </div>
      <div className={f.stage} ref={box}>
        <div className={f.frameBox} style={{ ['--frame-w' as string]: `${w}px`, ['--frame-s' as string]: scale, ...(h ? { ['--frame-h' as string]: `${h}px` } : {}) }}>
          {rev > 0 && (
            <iframe key={`${rev}-${device}`} title="معاينة الدورة" src={`${url}?draft=1&r=${rev}`} className={f.frame}
              onLoad={() => setBusy(false)} />
          )}
        </div>
      </div>
    </div>
  )
}
