'use client'
import { History } from '@/admin/ui/History'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { generateBatch, saveCoupon, type CouponInput } from './actions'
import { DateTime, Field, Grid, Input, Money, PageHead, SaveBar, Section, Segmented, Switch } from '@/admin/ui/kit'
import p from '@/admin/ui/panel.module.css'
import s from './sales.module.css'

type Opt = { id: string; title: string }

export function CouponEditor({ id, initial, courses, tracks }: { id: string | null; initial: CouponInput; courses: Opt[]; tracks: Opt[] }) {
  const router = useRouter()
  const [v, setV] = useState(initial)
  const [saved, setSaved] = useState(JSON.stringify(initial))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [batch, setBatch] = useState(false)
  const [count, setCount] = useState(20)
  const [codes, setCodes] = useState<string[]>([])
  const set = <K extends keyof CouponInput>(k: K, x: CouponInput[K]) => { setV((o) => ({ ...o, [k]: x })); setMsg(null) }
  const toggle = (k: 'courseIds' | 'trackIds', x: string) => set(k, v[k].includes(x) ? v[k].filter((y) => y !== x) : [...v[k], x])

  const save = async () => {
    setSaving(true)
    if (batch) {
      const r = await generateBatch({ ...v, count, prefix: v.code })
      setSaving(false)
      if (!r.ok) { setMsg({ ok: false, text: r.error ?? 'تعذّر' }); return }
      setCodes(r.codes!)
      setMsg({ ok: true, text: `وُلّد ${r.codes!.length} كوداً` })
      return
    }
    const r = await saveCoupon(id, v)
    setSaving(false)
    if (!r.ok) { setErrors(r.errors); setMsg({ ok: false, text: r.message ?? 'راجع الحقول' }); return }
    setErrors({}); setSaved(JSON.stringify(v)); setMsg({ ok: true, text: 'حُفظ الكوبون' })
    if (!id) router.replace(`/admin/coupons/${r.id}`); else router.refresh()
  }

  return (
    <>
      <PageHead title={id ? v.code : 'كوبون جديد'} actions={id ? <History entity="coupon" id={id} current={v} onRestore={(x) => { setV(x); setMsg({ ok: true, text: 'حُمّلت النسخة — راجعها ثم احفظ' }) }} /> : null} sub={batch ? 'دفعة أكواد فريدة لاستخدام واحد لكل كود — للمؤسسات والمنح' : 'رابط التطبيق التلقائي: /courses?coupon=' + (v.code || 'CODE')} />
      {!id && <div className={p.gapEnd}><Switch checked={batch} onChange={setBatch} label="توليد دفعة أكواد لمؤسسة" /></div>}
      <Section title="الخصم">
        <Grid>
          <Field label={batch ? 'بادئة الأكواد' : 'الرمز'} error={errors.code} hint={batch ? 'مثل: ARAMCO ← ARAMCO-7KQ2XM' : 'حروف إنجليزية وأرقام'}><Input dir="ltr" value={v.code} onChange={(e) => set('code', e.target.value.toUpperCase())} /></Field>
          <Field label="وصف داخلي"><Input value={v.label} onChange={(e) => set('label', e.target.value)} placeholder="مثل: حملة رمضان" /></Field>
        </Grid>
        <Segmented value={v.kind} onChange={(x) => set('kind', x)} options={[{ value: 'percent', label: 'نسبة مئوية' }, { value: 'amount', label: 'مبلغ ثابت' }]} />
        <Grid>
          {v.kind === 'percent'
            ? <Field label="النسبة %" error={errors.value} hint="100% = منحة كاملة"><Input type="number" dir="ltr" min={1} max={100} value={v.value} onChange={(e) => set('value', Number(e.target.value))} /></Field>
            : <Field label="المبلغ" error={errors.value}><Money value={v.value} onChange={(x) => set('value', x ?? 0)} /></Field>}
          <Field label="الحد الأدنى للطلب"><Money value={v.minAmount} onChange={(x) => set('minAmount', x)} placeholder="بلا حد" /></Field>
        </Grid>
        <Switch checked={v.stackWithSale} onChange={(x) => set('stackWithSale', x)} label="يجتمع مع العروض السارية" />
      </Section>
      <Section title="النطاق">
        <Segmented value={v.scope} onChange={(x) => set('scope', x)} options={[{ value: 'all', label: 'كل الدورات' }, { value: 'courses', label: 'دورات محددة' }, { value: 'tracks', label: 'مسارات محددة' }]} />
        {v.scope === 'courses' && <Chips items={courses} on={v.courseIds} toggle={(x) => toggle('courseIds', x)} error={errors.courseIds} />}
        {v.scope === 'tracks' && <Chips items={tracks} on={v.trackIds} toggle={(x) => toggle('trackIds', x)} error={errors.trackIds} />}
        <Field label="مقصور على بريد منشأة" error={errors.emailDomain} hint="مثل company.sa — لا يُقبل إلا ببريد هذا النطاق"><Input dir="ltr" value={v.emailDomain} onChange={(e) => set('emailDomain', e.target.value)} placeholder="company.sa" /></Field>
      </Section>
      <Section title="الصلاحية والحدود">
        <Grid>
          <Field label="يبدأ"><DateTime value={v.startsAt} onChange={(x) => set('startsAt', x)} /></Field>
          <Field label="ينتهي" error={errors.endsAt}><DateTime value={v.endsAt} onChange={(x) => set('endsAt', x)} /></Field>
          {!batch && <Field label="حد الاستخدام الكلي"><Input type="number" dir="ltr" min={1} value={v.maxUses ?? ''} placeholder="بلا حد" onChange={(e) => set('maxUses', e.target.value ? Number(e.target.value) : null)} /></Field>}
          {!batch && <Field label="لكل متدرب"><Input type="number" dir="ltr" min={1} value={v.maxPerLearner ?? ''} placeholder="بلا حد" onChange={(e) => set('maxPerLearner', e.target.value ? Number(e.target.value) : null)} /></Field>}
          {batch && <Field label="عدد الأكواد"><Input type="number" dir="ltr" min={1} max={500} value={count} onChange={(e) => setCount(Number(e.target.value))} /></Field>}
        </Grid>
        {!batch && <Switch checked={v.active} onChange={(x) => set('active', x)} label="مفعّل" />}
      </Section>
      {codes.length > 0 && (
        <Section title="الأكواد المولّدة" desc="انسخها وأرسلها للمؤسسة — كل كود لاستخدام واحد">
          <textarea readOnly dir="ltr" rows={8} value={codes.join('\n')} className={s.codes} />
          <button className={`btn ghost ${p.start}`} onClick={() => navigator.clipboard?.writeText(codes.join('\n'))}>نسخ الكل</button>
        </Section>
      )}
      <SaveBar dirty={batch ? codes.length === 0 : JSON.stringify(v) !== saved} saving={saving} message={msg} onSave={save} />
    </>
  )
}

export function Chips({ items, on, toggle, error }: { items: Opt[]; on: string[]; toggle: (id: string) => void; error?: string }) {
  return (
    <div>
      <div className={p.chips}>
        {items.map((i) => (
          <button key={i.id} type="button" className={p.chip} onClick={() => toggle(i.id)} aria-pressed={on.includes(i.id)}>
            {i.title.replace(/~\d?/g, '')}
          </button>
        ))}
      </div>
      {error && <span className={p.errStrong}>{error}</span>}
    </div>
  )
}
