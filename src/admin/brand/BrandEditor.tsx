'use client'
/* الهوية والشعارات — شعار الأكاديمية وشعار شركة ناف بنسختين (للخلفيات الفاتحة والداكنة)، والأيقونة، والأسماء،
   مع معاينة حيّة لكل سطح: الشريط فوق صفحة فاتحة ومشهد داكن، والتذييل، ورأس الشهادة، ورأس البريد. */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Media } from '@/server/db/schema'
import type { BrandSettings, BrandView, LogoImg } from '@/lib/brand'
import { LogoMark, Wordmark } from '@/components/Logo'
import { Field, Grid, Input, SaveBar, Section, Switch } from '@/admin/ui/kit'
import { MediaPicker } from '@/admin/ui/MediaPicker'
import { saveBrand } from './actions'
import b from './brand.module.css'

export function BrandEditor({ initial, media }: { initial: BrandSettings; media: Media[] }) {
  const router = useRouter()
  const [v, setV] = useState(initial)
  const [saved, setSaved] = useState(JSON.stringify(initial))
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const png = media.filter((m) => m.mime === 'image/png')
  const dirty = JSON.stringify(v) !== saved

  const view: BrandView = useMemo(() => {
    const img = (id: string | null): LogoImg | null => { const m = id ? media.find((x) => x.id === id) : undefined; return m ? { url: `/media/${m.key}`, key: m.key, w: m.width, h: m.height } : null }
    return { ...v, academy: { light: img(v.academy.light), dark: img(v.academy.dark) }, naf: { light: img(v.naf.light), dark: img(v.naf.dark) }, icon: img(v.icon) }
  }, [v, media])

  const set = (p: Partial<BrandSettings>) => { setV((o) => ({ ...o, ...p })); setMsg(null) }
  const save = async () => {
    setSaving(true)
    const r = await saveBrand(v)
    setSaving(false)
    if (r.ok) { setSaved(JSON.stringify(v)); setMsg({ ok: true, text: 'حُفظت الهوية — ظهرت في كل الصفحات' }); router.refresh() }
    else setMsg({ ok: false, text: r.error ?? 'تعذّر الحفظ' })
  }

  const slot = (label: string, hint: string, value: string | null, onChange: (id: string | null) => void, dark: boolean, ratio = '3 / 1') => (
    <div className={b.slot} data-dark={dark ? '1' : '0'}>
      <MediaPicker label={label} value={value} onChange={onChange} library={png} ratio={ratio} />
      <small>{hint}</small>
    </div>
  )

  return (
    <>
      <Section title="شعار الأكاديمية" desc="يظهر في الشريط والتذييل والستار الافتتاحي ومشهد الجسيمات واللوحة والفاتورة والبريد والشهادة وصور المشاركة">
        <Grid>
          {slot('للخلفيات الفاتحة', 'PNG بخلفية شفافة — شعار داكن الألوان', v.academy.light, (light) => set({ academy: { ...v.academy, light } }), false)}
          {slot('للخلفيات الداكنة', 'اختياري — شعار فاتح الألوان؛ إن تُرك استُعملت النسخة الأولى', v.academy.dark, (dark) => set({ academy: { ...v.academy, dark } }), true)}
        </Grid>
        <Switch checked={v.showName} onChange={(showName) => set({ showName })} label={v.showName ? 'يُكتب اسم الأكاديمية بجوار الشعار' : 'الشعار وحده (يتضمن الاسم)'} />
      </Section>

      <Section title="شعار شركة ناف" desc="يظهر في أعلى الشهادة بجوار شعار الأكاديمية بالحجم نفسه، وفي التذييل والبريد والفاتورة">
        <Grid>
          {slot('للخلفيات الفاتحة', 'PNG بخلفية شفافة', v.naf.light, (light) => set({ naf: { ...v.naf, light } }), false)}
          {slot('للخلفيات الداكنة', 'اختياري — نسخة فاتحة', v.naf.dark, (dark) => set({ naf: { ...v.naf, dark } }), true)}
        </Grid>
      </Section>

      <Section title="الأيقونة والأسماء">
        <Grid>
          {slot('أيقونة المتصفح والتطبيق', 'مربعة PNG — 512×512 يُفضَّل؛ بدونها تُستعمل الأيقونة الافتراضية', v.icon, (icon) => set({ icon }), false, '1 / 1')}
          <div className={b.names}>
            <Field label="اسم الأكاديمية"><Input value={v.name} onChange={(e) => set({ name: e.target.value })} /></Field>
            <Field label="الوصف المختصر" hint="تحت الاسم في الشريط"><Input value={v.tagline} onChange={(e) => set({ tagline: e.target.value })} /></Field>
            <Field label="اسم الشركة"><Input value={v.companyName} onChange={(e) => set({ companyName: e.target.value })} /></Field>
          </div>
        </Grid>
      </Section>

      <Section title="المعاينة" desc="كما ستظهر بعد الحفظ">
        <div className={b.previews}>
          <figure><figcaption>الشريط فوق صفحة فاتحة</figcaption><div className={b.bar} data-tone="light"><Wordmark brand={view} tone="light" /></div></figure>
          <figure><figcaption>الشريط فوق مشهد داكن</figcaption><div className={b.bar} data-tone="dark"><Wordmark brand={view} tone="dark" /></div></figure>
          <figure><figcaption>التذييل</figcaption><div className={b.bar} data-tone="dark"><Wordmark brand={view} tone="dark" /><span className={b.with}>إحدى مبادرات</span><LogoMark pair={view.naf} alt={view.companyName} height={26} tone="dark" fallback={false} />{!view.naf.light && !view.naf.dark && <span>{view.companyName}</span>}</div></figure>
          <figure><figcaption>رأس الشهادة — الشعاران متجاوران بالارتفاع نفسه</figcaption>
            <div className={b.cert}>
              <LogoMark pair={view.academy} alt={view.name} height={34} tone="light" />
              {(view.naf.light || view.naf.dark) && <><i aria-hidden="true" /><LogoMark pair={view.naf} alt={view.companyName} height={34} tone="light" fallback={false} /></>}
            </div>
          </figure>
          <figure><figcaption>رأس البريد</figcaption><div className={b.mail}><LogoMark pair={view.academy} alt={view.name} height={30} tone="dark" />{(v.showName || !(view.academy.light || view.academy.dark)) && <strong>{view.name}</strong>}</div></figure>
        </div>
      </Section>
      <SaveBar dirty={dirty} saving={saving} message={msg} onSave={save} />
    </>
  )
}
