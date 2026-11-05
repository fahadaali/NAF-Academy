'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { manualOrder, type ManualInput } from './actions'
import { Field, Grid, Input, PageHead, Section, Segmented, Select, Switch, Textarea } from '@/admin/ui/kit'

/** cohorts: null للدورة بلا دفعات، وقائمة (قد تكون فارغة) لدورة بدفعات */
type CourseOpt = { slug: string; title: string; tiers: { id: string; name: string }[]; cohorts: { id: string; title: string }[] | null }

export function ManualOrderForm({ courses }: { courses: CourseOpt[] }) {
  const router = useRouter()
  const [v, setV] = useState<ManualInput>({ courseSlug: courses[0]?.slug ?? '', tierId: courses[0]?.tiers[0]?.id ?? null, cohortId: courses[0]?.cohorts?.[0]?.id ?? null, quantity: 1, code: '', method: 'bank_transfer', note: '', attendSelf: true, buyer: { name: '', email: '', phone: '', org: '', vatNumber: '' } })
  const [err, setErr] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const course = courses.find((c) => c.slug === v.courseSlug)
  const b = (k: keyof ManualInput['buyer'], x: string) => setV((o) => ({ ...o, buyer: { ...o.buyer, [k]: x } }))
  return (
    <>
      <PageHead title="طلب يدوي" sub="للتحويل البنكي والنقد والمنح — يُسجَّل المتدرب فوراً وتصدر الفاتورة، والدفع الإلكتروني ليس شرطاً" />
      <Section title="الدورة">
        <Grid>
          <Field label="الدورة"><Select value={v.courseSlug} onChange={(x) => setV((o) => { const c = courses.find((y) => y.slug === x); return { ...o, courseSlug: x, tierId: c?.tiers[0]?.id ?? null, cohortId: c?.cohorts?.[0]?.id ?? null } })} options={courses.map((c) => ({ value: c.slug, label: c.title.replace(/~\d?/g, '') }))} /></Field>
          {course?.cohorts && (course.cohorts.length
            ? <Field label="الدفعة"><Select value={v.cohortId ?? ''} onChange={(x) => setV((o) => ({ ...o, cohortId: x }))} options={course.cohorts.map((k) => ({ value: k.id, label: k.title }))} /></Field>
            : <Field label="الدفعة" hint="كل دفعات هذه الدورة منتهية أو مغلقة — افتح دفعة من محرّر الدورة"><Input disabled value="لا دفعة متاحة" /></Field>)}
          {course && course.tiers.length > 0 && <Field label="الباقة"><Select value={v.tierId ?? ''} onChange={(x) => setV((o) => ({ ...o, tierId: x }))} options={course.tiers.map((t) => ({ value: t.id, label: t.name }))} /></Field>}
          <Field label="عدد المقاعد"><Input type="number" dir="ltr" min={1} max={50} value={v.quantity} onChange={(e) => setV((o) => ({ ...o, quantity: Number(e.target.value) }))} /></Field>
          <Field label="كوبون (اختياري)"><Input dir="ltr" value={v.code} onChange={(e) => setV((o) => ({ ...o, code: e.target.value.toUpperCase() }))} /></Field>
        </Grid>
        {v.quantity > 1 && <Switch checked={v.attendSelf} onChange={(x) => setV((o) => ({ ...o, attendSelf: x }))} label="المشتري يحضر بنفسه" />}
        <Field label="طريقة السداد"><Segmented value={v.method} onChange={(x) => setV((o) => ({ ...o, method: x }))} options={[{ value: 'bank_transfer', label: 'تحويل بنكي' }, { value: 'cash', label: 'نقد' }, { value: 'grant', label: 'منحة (بلا مقابل)' }]} /></Field>
      </Section>
      <Section title="المشتري">
        <Grid>
          <Field label="الاسم" error={err['buyer.name']}><Input value={v.buyer.name} onChange={(e) => b('name', e.target.value)} /></Field>
          <Field label="البريد" error={err['buyer.email']}><Input dir="ltr" value={v.buyer.email} onChange={(e) => b('email', e.target.value)} /></Field>
          <Field label="الجوال"><Input dir="ltr" value={v.buyer.phone} onChange={(e) => b('phone', e.target.value)} /></Field>
          <Field label="الجهة"><Input value={v.buyer.org} onChange={(e) => b('org', e.target.value)} /></Field>
          <Field label="الرقم الضريبي للمنشأة"><Input dir="ltr" value={v.buyer.vatNumber} onChange={(e) => b('vatNumber', e.target.value.replace(/\D/g, ''))} /></Field>
        </Grid>
        <Field label="ملاحظة داخلية" hint="مثل رقم التحويل البنكي"><Textarea rows={2} value={v.note} onChange={(e) => setV((o) => ({ ...o, note: e.target.value }))} /></Field>
      </Section>
      {msg && <p style={{ color: 'var(--danger)', fontWeight: 600, marginBlockEnd: 12 }}>{msg}</p>}
      <button className="btn" disabled={busy} onClick={async () => {
        setBusy(true); setMsg('')
        const r = await manualOrder(v)
        setBusy(false)
        if (r.ok) router.push(`/admin/orders/${r.id}`)
        else { setMsg(r.error ?? 'تعذّر'); setErr(r.fields ?? {}) }
      }}>{busy ? 'جارٍ…' : 'أنشئ الطلب وسجّل المتدرب'}</button>
    </>
  )
}
