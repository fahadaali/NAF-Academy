'use client'
/* الصفحات العامة — رؤوس صفحات الدورات والمسارات والدخول والسياسات، ووصف الموقع، ووصف كل صفحة في نتائج البحث. */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PageHeadContent, PagesContent } from '@/content/pages-defaults'
import { savePages } from '@/admin/actions'
import { Field, Grid, Input, PageHead, SaveBar, Section, Textarea } from '@/admin/ui/kit'

const KASHIDA = 'للتمدّد: ضع ~ ثم رقماً من 1 إلى 5 بين حرفين متصلين، مثل «درج~3ة»'
const SEO = 'يظهر تحت العنوان في نتائج البحث — نحو 150 حرفاً'

export function PagesEditor({ initial }: { initial: PagesContent }) {
  const router = useRouter()
  const [v, setV] = useState(initial)
  const [saved, setSaved] = useState(JSON.stringify(initial))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const up = <K extends keyof PagesContent>(k: K, patch: Partial<PagesContent[K]>) => { setV((o) => ({ ...o, [k]: { ...o[k], ...patch } })); setMsg(null) }
  const save = async () => {
    setSaving(true)
    const r = await savePages(v)
    setSaving(false)
    if (r.ok) { setSaved(JSON.stringify(v)); setMsg({ ok: true, text: 'نُشرت — ظهرت في الصفحات' }); router.refresh() }
    else setMsg({ ok: false, text: r.message ?? 'تعذّر الحفظ' })
  }
  const head = (k: 'courses' | 'tracks' | 'login' | 'policies', hint?: string) => {
    const h = v[k] as PageHeadContent
    return (
      <Grid>
        <Field label="السطر الصغير"><Input value={h.eyebrow} onChange={(e) => up(k, { eyebrow: e.target.value } as never)} /></Field>
        <Field label="العنوان" hint={hint ?? KASHIDA}><Input value={h.title} onChange={(e) => up(k, { title: e.target.value } as never)} /></Field>
        <Field label="الوصف تحت العنوان" wide><Textarea rows={2} value={h.body} onChange={(e) => up(k, { body: e.target.value } as never)} /></Field>
      </Grid>
    )
  }

  return (
    <>
      <PageHead title="الصفحات العامة" sub="رؤوس الصفحات ووصفها في نتائج البحث والسياسات — تُنشر فور الحفظ" />
      <Section title="الموقع" desc="العنوان والوصف العامّان: نتائج البحث، والمشاركة، وبيان التطبيق المثبّت">
        <Grid>
          <Field label="عنوان الموقع"><Input value={v.site.title} onChange={(e) => up('site', { title: e.target.value })} /></Field>
          <Field label="وصف الموقع" hint={SEO}><Textarea rows={2} value={v.site.description} onChange={(e) => up('site', { description: e.target.value })} /></Field>
          <Field label="وصف الرئيسية في البحث" hint="اختياري — إن تُرك استُعمل وصف الموقع"><Textarea rows={2} value={v.home.seoDescription} onChange={(e) => up('home', { seoDescription: e.target.value })} /></Field>
        </Grid>
      </Section>
      <Section title="صفحة الدورات" desc="/courses">
        {head('courses')}
        <Field label="الوصف في البحث" hint={SEO}><Textarea rows={2} value={v.courses.seoDescription} onChange={(e) => up('courses', { seoDescription: e.target.value })} /></Field>
      </Section>
      <Section title="صفحة المسارات" desc="/tracks — اكتب {{count}} حيث تريد عدد المسارات الظاهرة الآن">
        {head('tracks', `${KASHIDA} · {{count}} = عدد المسارات`)}
        <Field label="الوصف في البحث" hint={SEO}><Textarea rows={2} value={v.tracks.seoDescription} onChange={(e) => up('tracks', { seoDescription: e.target.value })} /></Field>
      </Section>
      <Section title="صفحة الدخول" desc="/login">{head('login')}</Section>
      <Section title="السياسات" desc="/policies — سياسة الاسترداد تُحرَّر من «إعدادات الدفع» وتظهر هنا تلقائياً. القسم الفارغ لا يظهر.">
        {head('policies')}
        <Field label="الشروط والأحكام" hint="فقرات، و## لعنوان فرعي، و- لبند"><Textarea rows={10} value={v.policies.terms} onChange={(e) => up('policies', { terms: e.target.value })} /></Field>
        <Field label="سياسة الخصوصية" hint="ما يُجمع من بيانات ولماذا، ومدة حفظها، وحقوق صاحبها — راجعها مستشارك القانوني قبل النشر"><Textarea rows={10} value={v.policies.privacy} onChange={(e) => up('policies', { privacy: e.target.value })} /></Field>
      </Section>
      <SaveBar dirty={JSON.stringify(v) !== saved} saving={saving} message={msg} onSave={save} extra={<a className="btn ghost" href="/policies" target="_blank" rel="noreferrer">عرض السياسات ↗</a>} />
    </>
  )
}
