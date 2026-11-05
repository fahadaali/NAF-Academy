'use client'
/* محرّر قالب الشهادة — اسحب العناصر على المعاينة (أو حرّكها بالأسهم)، وعدّل النصوص والموقّعين والخلفية،
   ثم «معاينة PDF» تولّد الملف الحقيقي بالقالب الحالي قبل الحفظ. */
import { History } from '@/admin/ui/History'
import { useEffect, useRef, useState } from 'react'
import type { BrandView } from '@/lib/brand'
import { useRouter } from 'next/navigation'
import type { Media } from '@/server/db/schema'
import { BLOCKS, BLOCK_LABEL, type BlockKey, type CertDesign, DEFAULT_DESIGN } from '@/lib/certificate'
import { CertificateView } from '@/components/CertificateView'
import { Field, Grid, Input, SaveBar, Section, Segmented, Switch } from '@/admin/ui/kit'
import { MediaPicker } from '@/admin/ui/MediaPicker'
import { deleteTemplate, duplicateTemplate, previewTemplatePdf, saveTemplate } from './actions'
import t from './template.module.css'

const SAMPLE = { name: 'سارة عبدالله المتدربة', course: 'نظام الإثبات: من النص إلى المرافعة', hours: 12, date: '5 نوفمبر 2026', hijri: '14 جمادى الأولى 1448', code: 'NAF-DEMO-2026', nameEn: 'Sarah Abdullah', courseEn: 'Evidence Law: From Text to Pleading', dateEn: '5 November 2026' }

export function TemplateEditor({ id, initial, media, brand }: { id: string | null; initial: { name: string; isDefault: boolean; design: CertDesign }; media: Media[]; brand: BrandView }) {
  const router = useRouter()
  const [v, setV] = useState(initial)
  const [saved, setSaved] = useState(JSON.stringify(initial))
  const [active, setActive] = useState<BlockKey | null>('name')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pdf, setPdf] = useState<string | null>(null)
  const stage = useRef<HTMLDivElement>(null)
  const drag = useRef<{ k: BlockKey; dx: number; dy: number } | null>(null)
  const d = v.design
  const dirty = JSON.stringify(v) !== saved
  const images = media.filter((m) => m.mime === 'image/png' || m.mime === 'image/jpeg')

  const setD = (p: Partial<CertDesign>) => { setV((o) => ({ ...o, design: { ...o.design, ...p } })); setMsg(null) }
  const setBlock = (k: BlockKey, p: Partial<CertDesign['blocks'][BlockKey]>) => setV((o) => ({ ...o, design: { ...o.design, blocks: { ...o.design.blocks, [k]: { ...o.design.blocks[k], ...p } } } }))

  const onPick = (k: BlockKey, e: React.PointerEvent) => {
    const r = stage.current!.getBoundingClientRect()
    const b = d.blocks[k]
    drag.current = { k, dx: ((e.clientX - r.left) / r.width) * 100 - b.x, dy: ((e.clientY - r.top) / r.height) * 100 - b.y }
    setActive(k)
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const g = drag.current
      if (!g || !stage.current) return
      const r = stage.current.getBoundingClientRect()
      const x = Math.round((((e.clientX - r.left) / r.width) * 100 - g.dx) * 2) / 2
      const y = Math.round((((e.clientY - r.top) / r.height) * 100 - g.dy) * 2) / 2
      setBlock(g.k, { x: Math.max(4, Math.min(96, x)), y: Math.max(5, Math.min(95, y)) })
    }
    const up = () => { drag.current = null }
    addEventListener('pointermove', move)
    addEventListener('pointerup', up)
    return () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up) }
  }, [])

  /* الأسهم تحرّك العنصر المحدد (Shift للخطوة الكبيرة) */
  const onKey = (e: React.KeyboardEvent) => {
    if (!active || (e.target as HTMLElement).closest('input, textarea, select')) return
    const step = e.shiftKey ? 2 : 0.5
    const b = d.blocks[active]
    const map: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    const m = map[e.key]
    if (!m) return
    e.preventDefault()
    setBlock(active, { x: Math.max(4, Math.min(96, b.x + m[0])), y: Math.max(5, Math.min(95, b.y + m[1])) })
  }

  const save = async () => {
    setSaving(true); setMsg(null)
    const r = await saveTemplate(id, v)
    setSaving(false)
    if (!r.ok) { setErrors(r.errors); setMsg({ ok: false, text: Object.values(r.errors)[0] ?? 'راجع الحقول' }); return }
    setErrors({}); setSaved(JSON.stringify(v)); setMsg({ ok: true, text: 'حُفظ القالب' })
    if (!id) router.replace(`/admin/certificates/templates/${r.id}`)
  }

  return (
    <>
      <div className={t.layout} onKeyDown={onKey}>
        <div className={t.stageCol}>
          <div className={t.stage} tabIndex={0} aria-label="معاينة القالب — اسحب العناصر أو حرّك المحدد بالأسهم">
            <CertificateView design={d} data={SAMPLE} brand={brand} onPick={onPick} active={active} dragRef={stage} images={Object.fromEntries(media.map((m) => [m.id, `/media/${m.key}`]))} />
          </div>
          <div className={t.tools}>
            <span className={t.hint}>اسحب أي عنصر لتحريكه، أو حدّده وحرّكه بالأسهم (Shift للخطوة الكبيرة).</span>
            <button type="button" className="btn ghost" onClick={async () => { setPdf('…'); const url = await previewTemplatePdf(d); const blob = await (await fetch(url)).blob(); setPdf((old) => { if (old?.startsWith('blob:')) URL.revokeObjectURL(old); return URL.createObjectURL(blob) }) }}>معاينة PDF</button>
          </div>
          {pdf && (pdf === '…' ? <p className={t.hint}>جارٍ التوليد…</p> : <iframe title="معاينة PDF" className={t.pdf} src={pdf} />)}
        </div>

        <div className={t.side}>
          <Section title="القالب">
            <Field label="الاسم" error={errors.name}><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
            <Switch checked={v.isDefault} onChange={(isDefault) => setV({ ...v, isDefault })} label="القالب الافتراضي للدورات" />
            <Field label="الخلفية"><Segmented value={d.tone} onChange={(tone) => setD({ tone })} options={[{ value: 'ivory', label: 'عاجي' }, { value: 'night', label: 'كحلي' }]} /></Field>
            <MediaPicker label="صورة خلفية (اختيارية — PNG أو JPG بنسبة A4 أفقية)" value={d.backgroundId} onChange={(backgroundId) => setD({ backgroundId })} library={images} ratio="842 / 595" accept={['image/png', 'image/jpeg']} />
            {errors['design.backgroundId'] && <span className={t.err}>{errors['design.backgroundId']}</span>}
          </Section>

          <Section title="النصوص" desc="«~» ثم رقم لموضع الكشيدة: إتم~4ام">
            <Field label="العنوان" error={errors['design.title']}><Input value={d.title} onChange={(e) => setD({ title: e.target.value })} /></Field>
            <Switch checked={d.english} onChange={(english) => setD({ english })} label="سطر إنجليزي تحت العنوان" />
            <Field label="قبل الاسم"><Input value={d.lead} onChange={(e) => setD({ lead: e.target.value })} /></Field>
            <Field label="قبل اسم الدورة"><Input value={d.courseLead} onChange={(e) => setD({ courseLead: e.target.value })} /></Field>
            <Field label="سطر الساعات" hint="{{hours}} يُستبدل بساعات الدورة"><Input value={d.hoursText} onChange={(e) => setD({ hoursText: e.target.value })} /></Field>
          </Section>

          <Section title="الوجه الإنجليزي" desc="شهادة ثنائية اللغة: تحت كل سطر عربي سطره الإنجليزي — والاسم بالإنجليزية من ملف المتدرب، وعنوان الدورة من محرّرها">
            <Switch checked={!!d.bilingual} onChange={(bilingual) => setD({ bilingual })} label={d.bilingual ? 'ثنائية اللغة' : 'عربية فقط'} />
            {d.bilingual && (() => {
              const en = { ...DEFAULT_DESIGN.en, ...(d.en ?? {}) }
              const setEn = (p: Partial<typeof en>) => setD({ en: { ...en, ...p } })
              return (
                <>
                  <Field label="العنوان"><Input dir="ltr" value={en.title} onChange={(e) => setEn({ title: e.target.value })} /></Field>
                  <Field label="قبل الاسم"><Input dir="ltr" value={en.lead} onChange={(e) => setEn({ lead: e.target.value })} /></Field>
                  <Field label="قبل اسم الدورة"><Input dir="ltr" value={en.courseLead} onChange={(e) => setEn({ courseLead: e.target.value })} /></Field>
                  <Field label="سطر الساعات" hint="{{hours}}"><Input dir="ltr" value={en.hoursText} onChange={(e) => setEn({ hoursText: e.target.value })} /></Field>
                  <Field label="قبل التاريخ"><Input dir="ltr" value={en.issued} onChange={(e) => setEn({ issued: e.target.value })} /></Field>
                </>
              )
            })()}
          </Section>

          <Section title="الموقّعون" desc="حتى ثلاثة">
            {d.signatories.map((sg, i) => (
              <div key={i} className={t.signer}>
                <Grid>
                  <Field label="الاسم" error={errors[`design.signatories.${i}.name`]}><Input value={sg.name} onChange={(e) => setD({ signatories: d.signatories.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} /></Field>
                  <Field label="الصفة"><Input value={sg.title} onChange={(e) => setD({ signatories: d.signatories.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)) })} /></Field>
                  {d.bilingual && <Field label="الصفة بالإنجليزية"><Input dir="ltr" value={sg.titleEn ?? ''} onChange={(e) => setD({ signatories: d.signatories.map((x, k) => (k === i ? { ...x, titleEn: e.target.value } : x)) })} /></Field>}
                </Grid>
                <MediaPicker label="صورة التوقيع (PNG شفاف)" value={sg.signatureId} onChange={(signatureId) => setD({ signatories: d.signatories.map((x, k) => (k === i ? { ...x, signatureId } : x)) })} library={images} ratio="3 / 1" accept={['image/png']} />
                <button type="button" className={t.remove} onClick={() => setD({ signatories: d.signatories.filter((_, k) => k !== i) })}>إزالة الموقّع</button>
              </div>
            ))}
            {d.signatories.length < 3 && <button type="button" className="btn ghost" onClick={() => setD({ signatories: [...d.signatories, { name: '', title: '', signatureId: null }] })}>+ موقّع</button>}
          </Section>

          <Section title="العناصر" desc="الظهور والمقاس">
            <ul className={t.blocks} role="list">
              {BLOCKS.map((k) => (
                <li key={k} data-active={active === k ? '1' : '0'}>
                  <button type="button" className={t.blockName} onClick={() => setActive(k)} aria-pressed={active === k}>{BLOCK_LABEL[k]}</button>
                  <label className={t.size}><input type="number" dir="ltr" min={6} max={120} value={d.blocks[k].size} aria-label={`مقاس ${BLOCK_LABEL[k]}`} onChange={(e) => setBlock(k, { size: Number(e.target.value) })} />{k === 'qr' ? 'نقطة' : 'pt'}</label>
                  <input type="checkbox" checked={d.blocks[k].show} aria-label={`إظهار ${BLOCK_LABEL[k]}`} onChange={(e) => setBlock(k, { show: e.target.checked })} />
                </li>
              ))}
            </ul>
          </Section>

          {id && (
            <div className={t.danger}>
              <button type="button" className="btn ghost" onClick={async () => { const r = await duplicateTemplate(id); router.push(`/admin/certificates/templates/${r.id}`) }}>نسخ القالب</button>
              <button type="button" className={t.remove} onClick={async () => { if (!confirm('حذف القالب؟ الشهادات الصادرة لا تتأثر.')) return; const r = await deleteTemplate(id); if (r.ok) router.push('/admin/certificates/templates'); else setMsg({ ok: false, text: r.error ?? '' }) }}>حذف القالب</button>
            </div>
          )}
        </div>
      </div>
      <SaveBar dirty={dirty} saving={saving} message={msg} onSave={save} extra={id ? <History entity="certificate_template" id={id} current={v} onRestore={(x) => { setV(x); setMsg({ ok: true, text: 'حُمّلت النسخة — راجعها ثم احفظ' }) }} /> : null} />
    </>
  )
}
