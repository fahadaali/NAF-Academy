'use client'
/* العروض العامة: خصم تلقائي يظهر بجوار السعر باسمه وعدّاده، على المنصة كلها أو مسارات أو دورات.
   التسعير يختار الأفضل للمشتري بينه وبين عرض الدورة نفسها، بلا تراكم. */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { savePromotion } from './promotions'
import { trash } from '@/admin/actions'
import type { PromotionInput } from '@/admin/schemas'
import type { PromotionRow } from '@/server/db/schema'
import { Badge, DateTime, Field, Grid, Input, Money, PageHead, SaveBar, Section, Segmented, Switch } from '@/admin/ui/kit'
import { Chips } from './CouponEditor'
import { formatAmount } from '@/lib/pricing'
import { when } from './labels'
import p from '@/admin/ui/panel.module.css'

type Opt = { id: string; title: string }
const BLANK: PromotionInput = { label: '', scope: 'all', trackIds: [], courseIds: [], kind: 'percent', value: 10, startsAt: null, endsAt: null, active: true }
const SCOPE = { all: 'المنصة كلها', tracks: 'مسارات', courses: 'دورات' } as const

function stateOf(r: PromotionRow, now = Date.now()) {
  if (!r.active) return { tone: 'draft', label: 'موقوف' }
  if (r.endsAt && Date.parse(r.endsAt) <= now) return { tone: 'closed', label: 'انتهى' }
  if (r.startsAt && Date.parse(r.startsAt) > now) return { tone: 'soon', label: 'مجدول' }
  return { tone: 'open', label: 'ساري' }
}

export function PromotionsBoard({ rows, courses, tracks }: { rows: PromotionRow[]; courses: Opt[]; tracks: Opt[] }) {
  const router = useRouter()
  const [edit, setEdit] = useState<{ id: string | null; v: PromotionInput; saved: string } | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const set = <K extends keyof PromotionInput>(k: K, x: PromotionInput[K]) => { setEdit((e) => (e ? { ...e, v: { ...e.v, [k]: x } } : e)); setMsg(null) }
  const toggle = (k: 'courseIds' | 'trackIds', x: string) => edit && set(k, edit.v[k].includes(x) ? edit.v[k].filter((y) => y !== x) : [...edit.v[k], x])
  const open = (id: string | null, v: PromotionInput) => { setEdit({ id, v, saved: JSON.stringify(v) }); setErrors({}); setMsg(null) }

  const save = async () => {
    if (!edit) return
    setSaving(true)
    const r = await savePromotion(edit.id, edit.v)
    setSaving(false)
    if (!r.ok) { setErrors(r.errors); setMsg({ ok: false, text: r.message ?? 'راجع الحقول' }); return }
    setEdit(null)
    router.refresh()
  }

  return (
    <>
      <PageHead title="العروض العامة" sub="خصم تلقائي باسم يظهر بجوار السعر وعدّاد تنازلي — بلا كوبون"
        actions={!edit && <button className="btn" onClick={() => open(null, BLANK)}>+ عرض</button>} />
      {!edit && (rows.length === 0 ? <div className={p.empty}>لا عروض عامة. عرض الدورة الواحدة يُضبط من «التسعير والعروض» في محرّرها.</div> : (
        <table className={p.table}>
          <thead><tr><th>العرض</th><th>الخصم</th><th>النطاق</th><th>النافذة</th><th>الحالة</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => {
              const st = stateOf(r)
              return (
                <tr key={r.id}>
                  <td><button className={p.rowLink} onClick={() => open(r.id, { label: r.label, scope: r.scope, trackIds: r.trackIds, courseIds: r.courseIds, kind: r.kind, value: r.value, startsAt: r.startsAt, endsAt: r.endsAt, active: r.active })}>{r.label}</button></td>
                  <td className="num">{r.kind === 'percent' ? `${r.value}%` : `${formatAmount(r.value)} ر.س`}</td>
                  <td>{SCOPE[r.scope]}{r.scope !== 'all' && <span className={`${p.muted} num`}> ({r.scope === 'tracks' ? r.trackIds.length : r.courseIds.length})</span>}</td>
                  <td className={`${p.muted} num`}>{r.startsAt ? when(r.startsAt) : 'من الآن'} ← {r.endsAt ? when(r.endsAt) : 'بلا نهاية'}</td>
                  <td><Badge tone={st.tone}>{st.label}</Badge></td>
                  <td><button className={p.iconBtn} onClick={async () => { if (confirm(`نقل «${r.label}» إلى المحذوفات؟`)) { await trash('promotion', r.id); router.refresh() } }}>حذف</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ))}
      {edit && (
        <>
          <Section title="العرض" desc="الاسم يظهر للزائر بجوار السعر، مثل «عرض اليوم الوطني»">
            <Field label="اسم العرض" error={errors.label}><Input value={edit.v.label} onChange={(e) => set('label', e.target.value)} /></Field>
            <Segmented value={edit.v.kind} onChange={(x) => set('kind', x)} options={[{ value: 'percent', label: 'نسبة مئوية' }, { value: 'amount', label: 'مبلغ ثابت' }]} />
            {edit.v.kind === 'percent'
              ? <Field label="النسبة %" error={errors.value} hint="حتى 90% — تُحسب على السعر الأصلي"><Input type="number" dir="ltr" min={1} max={90} value={edit.v.value} onChange={(e) => set('value', Number(e.target.value))} /></Field>
              : <Field label="المبلغ" error={errors.value} hint="يُخصم من السعر الأصلي لكل مقعد"><Money value={edit.v.value} onChange={(x) => set('value', x ?? 0)} /></Field>}
          </Section>
          <Section title="النطاق">
            <Segmented value={edit.v.scope} onChange={(x) => set('scope', x)} options={[{ value: 'all', label: 'المنصة كلها' }, { value: 'tracks', label: 'مسارات' }, { value: 'courses', label: 'دورات' }]} />
            {edit.v.scope === 'tracks' && <Chips items={tracks} on={edit.v.trackIds} toggle={(x) => toggle('trackIds', x)} error={errors.trackIds} />}
            {edit.v.scope === 'courses' && <Chips items={courses} on={edit.v.courseIds} toggle={(x) => toggle('courseIds', x)} error={errors.courseIds} />}
          </Section>
          <Section title="النافذة" desc="يبدأ ويعود السعر الأصلي تلقائياً بموعده، وقبل نهايته تصل رسالة «قرب انتهاء العرض» للمهتمين">
            <Grid>
              <Field label="يبدأ" hint="فارغ = من الآن"><DateTime value={edit.v.startsAt} onChange={(x) => set('startsAt', x)} /></Field>
              <Field label="ينتهي" error={errors.endsAt} hint="فارغ = حتى يُوقف"><DateTime value={edit.v.endsAt} onChange={(x) => set('endsAt', x)} /></Field>
            </Grid>
            <Switch checked={edit.v.active} onChange={(x) => set('active', x)} label={edit.v.active ? 'مفعّل' : 'موقوف'} />
          </Section>
          <SaveBar dirty={JSON.stringify(edit.v) !== edit.saved || !edit.id} saving={saving} message={msg} onSave={save}
            extra={<button type="button" className="btn ghost" onClick={() => setEdit(null)}>رجوع</button>} />
        </>
      )}
    </>
  )
}
