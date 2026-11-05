'use client'
import { History } from '@/admin/ui/History'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Media } from '@/server/db/schema'
import { saveInstructor, trash } from '@/admin/actions'
import type { Errors, InstructorInput } from '@/admin/schemas'
import { Field, Grid, Input, ListEditor, PageHead, SaveBar, Section, Segmented, Switch, Textarea, RowTools, useSortable } from '@/admin/ui/kit'
import { MediaPicker } from '@/admin/ui/MediaPicker'
import { useCan } from '@/admin/ui/perms'

export function InstructorEditor({ id, initial, media }: { id: string | null; initial: InstructorInput; media: Media[] }) {
  const write = useCan()('content.write')
  const router = useRouter()
  const [v, setV] = useState(initial)
  const [saved, setSaved] = useState(JSON.stringify(initial))
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const set = <K extends keyof InstructorInput>(k: K, x: InstructorInput[K]) => { setV((o) => ({ ...o, [k]: x })); setMsg(null) }
  const links = useSortable(v.links, (x) => set('links', x))
  const save = async () => {
    setSaving(true)
    const r = await saveInstructor(id, v)
    setSaving(false)
    if (!r.ok) { setErrors(r.errors); setMsg({ ok: false, text: r.message ?? 'راجع الحقول' }); return }
    setErrors({}); setSaved(JSON.stringify(v)); setMsg({ ok: true, text: 'حُفظ المدرب' })
    if (!id) router.replace(`/admin/instructors/${r.id}`); else router.refresh()
  }
  return (
    <>
      <PageHead title={id ? v.name : 'مدرب جديد'} sub={`/instructors/${v.slug || '…'}`} actions={id && write ? <History entity="instructor" id={id} current={v} onRestore={(x) => { setV(x); setMsg({ ok: true, text: 'حُمّلت النسخة — راجعها ثم احفظ' }) }} /> : null} />
      <Section title="البيانات">
        <Grid>
          <Field label="الاسم" error={errors.name}><Input value={v.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="الرابط" error={errors.slug}><Input dir="ltr" value={v.slug} onChange={(e) => set('slug', e.target.value.toLowerCase())} /></Field>
          <Field label="المسمّى" hint="مثل: قاضٍ سابق، محامٍ ومستشار عقود" wide><Input value={v.title} onChange={(e) => set('title', e.target.value)} /></Field>
        </Grid>
        <Field label="النبذة"><Textarea rows={5} value={v.bio} onChange={(e) => set('bio', e.target.value)} /></Field>
        <Field label="أبرز الخبرات" hint="نقاط قصيرة تظهر في البطاقة الكاملة"><ListEditor value={v.highlights} onChange={(x) => set('highlights', x)} add="خبرة" /></Field>
        <Field label="الصورة الرسمية" hint="الوجه في نقطة التركيز — للبطاقات وصفحات الدورات"><MediaPicker value={v.photoId} onChange={(x) => set('photoId', x)} library={media} ratio="4 / 4.2" label="الصورة" /></Field>
        <Field label="صورة المشهد" hint="اختيارية — صورة أوسع في بيئة العمل لمشهد المدربين في الرئيسية وأعلى صفحة المدرب. بدونها تُستعمل الرسمية"><MediaPicker value={v.sceneId ?? null} onChange={(x) => set('sceneId', x)} library={media} ratio="3 / 4" label="صورة المشهد" /></Field>
      </Section>
      <Section title="طريقة الظهور">
        <Segmented value={v.display} onChange={(x) => set('display', x)} options={[
          { value: 'full', label: 'بطاقة كاملة مع الخبرات' }, { value: 'compact', label: 'بطاقة مختصرة' }, { value: 'hidden', label: 'مخفي من الرئيسية' },
        ]} />
        <Switch checked={v.featured} onChange={(x) => set('featured', x)} label="مدرب مميز (شارة)" />
      </Section>
      <Section title="روابط">
        {v.links.map((l, i) => (
          <div key={i} style={{ display: 'flex', gap: 8 }} {...links.props(i)}>
            <Input placeholder="التسمية (لينكدإن)" value={l.label} onChange={(e) => set('links', v.links.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
            <Input dir="ltr" placeholder="https://" value={l.url} onChange={(e) => set('links', v.links.map((x, k) => (k === i ? { ...x, url: e.target.value } : x)))} />
            <RowTools i={i} n={v.links.length} move={links.move} onRemove={() => set('links', v.links.filter((_, k) => k !== i))} />
          </div>
        ))}
        {errors[Object.keys(errors).find((k) => k.startsWith('links')) ?? ''] && <span style={{ color: 'var(--danger)', fontSize: 13 }}>رابط غير صالح</span>}
        <button type="button" className="btn ghost" style={{ justifySelf: 'start' }} onClick={() => set('links', [...v.links, { label: '', url: '' }])}>+ رابط</button>
      </Section>
      <SaveBar readOnly={write ? undefined : 'للعرض فقط — التعديل لمن يملك صلاحية المحتوى'} dirty={JSON.stringify(v) !== saved} saving={saving} message={msg} onSave={save}
        extra={id ? <button type="button" className="btn ghost" onClick={async () => { if (confirm('نقل المدرب إلى المحذوفات؟')) { await trash('instructor', id); router.push('/admin/instructors') } }}>حذف</button> : null} />
    </>
  )
}
