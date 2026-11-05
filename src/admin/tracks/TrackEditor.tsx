'use client'
import { History } from '@/admin/ui/History'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Media } from '@/server/db/schema'
import { TONES } from '@/lib/enums'
import { saveTrack, trash } from '@/admin/actions'
import type { Errors, TrackInput } from '@/admin/schemas'
import { Field, Grid, Input, PageHead, SaveBar, Section, Segmented, Switch, Textarea } from '@/admin/ui/kit'
import { MediaPicker } from '@/admin/ui/MediaPicker'
import { useCan } from '@/admin/ui/perms'

const TONE_LABEL: Record<(typeof TONES)[number], string> = { gold: 'ذهبي', olive: 'زيتوني', night: 'ليلي', ember: 'جمري', ivory: 'عاجي' }

export function TrackEditor({ id, initial, media }: { id: string | null; initial: TrackInput; media: Media[] }) {
  const write = useCan()('content.write')
  const router = useRouter()
  const [v, setV] = useState(initial)
  const [saved, setSaved] = useState(JSON.stringify(initial))
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const set = <K extends keyof TrackInput>(k: K, x: TrackInput[K]) => { setV((o) => ({ ...o, [k]: x })); setMsg(null) }
  const save = async () => {
    setSaving(true)
    const r = await saveTrack(id, v)
    setSaving(false)
    if (!r.ok) { setErrors(r.errors); setMsg({ ok: false, text: r.message ?? 'راجع الحقول' }); return }
    setErrors({}); setSaved(JSON.stringify(v)); setMsg({ ok: true, text: 'حُفظ المسار' })
    if (!id) router.replace(`/admin/tracks/${r.id}`); else router.refresh()
  }
  return (
    <>
      <PageHead title={id ? v.title : 'مسار جديد'} sub={`/tracks/${v.slug || '…'}`} actions={id && write ? <History entity="track" id={id} current={v} onRestore={(x) => { setV(x); setMsg({ ok: true, text: 'حُمّلت النسخة — راجعها ثم احفظ' }) }} /> : null} />
      <Section title="المسار">
        <Grid>
          <Field label="العنوان" error={errors.title}><Input value={v.title} onChange={(e) => set('title', e.target.value)} /></Field>
          <Field label="الرابط" error={errors.slug}><Input dir="ltr" value={v.slug} onChange={(e) => set('slug', e.target.value.toLowerCase())} /></Field>
          <Field label="العنوان الصغير" hint="مثل: المسار ١"><Input value={v.kicker} onChange={(e) => set('kicker', e.target.value)} /></Field>
          <Field label="الحرف المميز" hint="حرف واحد يظهر على المجلد"><Input value={v.glyph} maxLength={3} onChange={(e) => set('glyph', e.target.value)} /></Field>
        </Grid>
        <Field label="الملخص" hint="سطر على المجلد"><Input value={v.summary} onChange={(e) => set('summary', e.target.value)} /></Field>
        <Field label="الوصف" hint="يظهر في صفحة المسار"><Textarea rows={5} value={v.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <Field label="لون المجلد"><Segmented value={v.tone} onChange={(x) => set('tone', x)} options={TONES.map((t) => ({ value: t, label: TONE_LABEL[t] }))} /></Field>
        <Field label="صورة المجلد" hint="اختيارية — تحلّ محل الحرف المميز"><MediaPicker value={v.coverId} onChange={(x) => set('coverId', x)} library={media} ratio="3 / 4" /></Field>
        <Switch checked={v.visible} onChange={(x) => set('visible', x)} label="ظاهر في الموقع" />
      </Section>
      <SaveBar readOnly={write ? undefined : 'للعرض فقط — التعديل لمن يملك صلاحية المحتوى'} dirty={JSON.stringify(v) !== saved} saving={saving} message={msg} onSave={save}
        extra={id ? <button type="button" className="btn ghost" onClick={async () => { if (confirm('نقل المسار إلى المحذوفات؟')) { await trash('track', id); router.push('/admin/tracks') } }}>حذف</button> : null} />
    </>
  )
}
