'use client'
/* الهوية والشعارات — ثلاث صيغ لشعار الأكاديمية، لكل منها نسختان (للخلفيات الفاتحة والداكنة)، والأيقونة، والأسماء،
   مع معاينة حيّة لكل سطح. الملف المعروض SVG (متجه، ويتحرك في مواضع الحركة) أو PNG؛ واختيار SVG يولّد له
   توأماً PNG تلقائياً (للبريد والشهادة وصور المشاركة) — تحويل صيغة فقط، بلا أي تعديل في الرسم أو الألوان. */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Media } from '@/server/db/schema'
import { large, LOGO_MIME, type BrandSettings, type BrandView, type LogoImg, type LogoSlot, type LogoSlotKey } from '@/lib/brand'
import { LogoMark, Wordmark } from '@/components/Logo'
import { Emblem } from '@/components/Emblem'
import { Field, Grid, Input, SaveBar, Section, Switch } from '@/admin/ui/kit'
import { MediaPicker, urlOf } from '@/admin/ui/MediaPicker'
import { listMedia, uploadMedia } from '@/admin/actions'
import { saveBrand } from './actions'
import b from './brand.module.css'

/** ارتفاع النسخة النقطية المولّدة — تكفي للطباعة في الشهادة وللشاشات عالية الكثافة */
const RASTER_H = 480
const RASTER_MAX_W = 2400

/** يرسم ملف SVG من المكتبة على لوحة ويرفعه PNG — يعيد معرّف الوسيط الجديد */
async function rasterize(m: Media): Promise<string | null> {
  const img = new Image()
  img.src = urlOf(m)
  await img.decode()
  const ratio = m.width && m.height ? m.width / m.height : img.naturalWidth / img.naturalHeight || 1
  const h = Math.round(Math.min(RASTER_H, RASTER_MAX_W / ratio))
  const w = Math.round(h * ratio)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const x = c.getContext('2d')
  if (!x) return null
  x.drawImage(img, 0, 0, w, h)
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
  if (!blob) return null
  const fd = new FormData()
  fd.set('file', new File([blob], `${(m.alt || 'logo').slice(0, 60)}.png`, { type: 'image/png' }))
  fd.set('alt', `${m.alt || 'شعار'} (PNG)`)
  const r = await uploadMedia(fd)
  return r.ok ? r.id ?? null : null
}

const SLOTS: { key: LogoSlotKey; title: string; desc: string; ratio: string }[] = [
  { key: 'lockup', title: 'الشعار الكامل', ratio: '8 / 3', desc: 'للمواضع الكبيرة (120px فأكثر): الستار الافتتاحي متحركاً، ورأس الشهادة، وصور المشاركة. إن غاب حلّت صيغة الشريط مكانه.' },
  { key: 'academy', title: 'صيغة الشريط', ratio: '3 / 1', desc: 'بين 28 و120px: الشريط العلوي واللوحة، والتذييل (يتحرك عند تكشّفه)، والبريد، والفاتورة.' },
  { key: 'mark', title: 'الرمز', ratio: '4 / 3', desc: 'الكتاب وحده: يتشكّل منه مشهد الجسيمات في الرئيسية، ويظهر حيث يكفي الرمز. بدونه يُرسم الكتاب الافتراضي.' },
]

export function BrandEditor({ initial, media }: { initial: BrandSettings; media: Media[] }) {
  const router = useRouter()
  const [v, setV] = useState(initial)
  const [lib, setLib] = useState(media)
  const [saved, setSaved] = useState(JSON.stringify(initial))
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [replay, setReplay] = useState(0)
  const logos = lib.filter((m) => LOGO_MIME.includes(m.mime))
  const png = lib.filter((m) => m.mime === 'image/png')
  const dirty = JSON.stringify(v) !== saved

  const find = (id: string | null) => (id ? lib.find((x) => x.id === id) : undefined)
  const view: BrandView = useMemo(() => {
    const ref = (m: Media) => ({ url: urlOf(m), key: m.key, w: m.width, h: m.height })
    const img = (id: string | null, twin: string | null): LogoImg | null => {
      const m = id ? lib.find((x) => x.id === id) : undefined
      if (!m) return null
      const svg = m.mime === 'image/svg+xml'
      const r = svg ? lib.find((x) => x.id === twin) : m
      return { ...ref(m), svg, raster: r ? ref(r) : null }
    }
    const pair = (s: LogoSlot) => ({ light: img(s.light, s.lightPng), dark: img(s.dark, s.darkPng) })
    const icon = find(v.icon)
    return {
      name: v.name, tagline: v.tagline, companyName: v.companyName, showName: v.showName,
      academy: pair(v.academy), lockup: pair(v.lockup), mark: pair(v.mark),
      icon: icon ? { ...ref(icon), svg: false, raster: ref(icon) } : null,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, lib])

  const set = (p: Partial<BrandSettings>) => { setV((o) => ({ ...o, ...p })); setMsg(null) }

  /** اختيار ملف لنسخة: SVG يُولَّد له توأم PNG، وPNG يكفي نفسه */
  const pickLogo = async (k: LogoSlotKey, t: 'light' | 'dark', id: string | null) => {
    const twin = `${t}Png` as const
    setV((o) => ({ ...o, [k]: { ...o[k], [t]: id, [twin]: null } }))
    setMsg(null)
    if (!id) return
    let list = lib
    if (!list.some((m) => m.id === id)) { list = await listMedia(); setLib(list) }
    const m = list.find((x) => x.id === id)
    if (m?.mime !== 'image/svg+xml') return
    setBusy(`${k}.${t}`)
    try {
      const pngId = await rasterize(m)
      if (!pngId) throw new Error()
      setLib(await listMedia())
      setV((o) => (o[k][t] === id ? { ...o, [k]: { ...o[k], [twin]: pngId } } : o))
    } catch {
      setMsg({ ok: false, text: 'تعذّر توليد نسخة PNG من ملف SVG — ارفع نسخة PNG بدلاً منه' })
    } finally {
      setBusy(null)
    }
  }

  const save = async () => {
    setSaving(true)
    const r = await saveBrand(v)
    setSaving(false)
    if (r.ok) { setSaved(JSON.stringify(v)); setMsg({ ok: true, text: 'حُفظت الهوية — ظهرت في كل الصفحات' }); router.refresh() }
    else setMsg({ ok: false, text: r.error ?? 'تعذّر الحفظ' })
  }

  const state = (k: LogoSlotKey, t: 'light' | 'dark') => {
    if (busy === `${k}.${t}`) return 'يُولَّد توأم PNG…'
    const m = find(v[k][t])
    if (!m) return t === 'dark' ? 'اختياري — إن تُرك استُعملت النسخة الأخرى' : 'SVG (يتحرك) أو PNG بخلفية شفافة'
    if (m.mime === 'image/png') return 'PNG — ثابت في كل المواضع'
    return v[k][`${t}Png`] ? 'SVG متحرك · نسخة PNG جاهزة للبريد والشهادة' : 'SVG بلا نسخة PNG — أعد اختياره'
  }

  const slot = (k: LogoSlotKey, t: 'light' | 'dark', ratio: string) => (
    <div className={b.slot} data-dark={t === 'dark' ? '1' : '0'}>
      <MediaPicker label={t === 'light' ? 'للخلفيات الفاتحة' : 'للخلفيات الداكنة'} value={v[k][t]} onChange={(id) => pickLogo(k, t, id)} library={logos} ratio={ratio} accept={LOGO_MIME} />
      <small>{state(k, t)}</small>
    </div>
  )

  const big = large(view)
  return (
    <>
      {SLOTS.map((S) => (
        <Section key={S.key} title={S.title} desc={S.desc}>
          <Grid>
            {slot(S.key, 'light', S.ratio)}
            {slot(S.key, 'dark', S.ratio)}
          </Grid>
          {S.key === 'academy' && (
            <Switch checked={v.showName} onChange={(showName) => set({ showName })} label={v.showName ? 'يُكتب اسم الأكاديمية بجوار الشعار' : 'الشعار وحده (الاسم داخل الشعار)'} />
          )}
        </Section>
      ))}

      <Section title="الأيقونة والأسماء">
        <Grid>
          <div className={b.slot}>
            <MediaPicker label="أيقونة المتصفح والتطبيق" value={v.icon} onChange={(icon) => set({ icon })} library={png} ratio="1 / 1" accept={['image/png']} />
            <small>مربعة PNG — 512×512 يُفضَّل؛ بدونها تُستعمل الأيقونة الافتراضية</small>
          </div>
          <div className={b.names}>
            <Field label="اسم الأكاديمية"><Input value={v.name} onChange={(e) => set({ name: e.target.value })} /></Field>
            <Field label="الوصف المختصر" hint="تحت الاسم في الشريط"><Input value={v.tagline} onChange={(e) => set({ tagline: e.target.value })} /></Field>
            <Field label="اسم الشركة" hint="نصاً في التذييل والبريد"><Input value={v.companyName} onChange={(e) => set({ companyName: e.target.value })} /></Field>
          </div>
        </Grid>
      </Section>

      <Section title="المعاينة" desc="كما ستظهر بعد الحفظ">
        <div className={b.previews}>
          <figure><figcaption>الشريط فوق صفحة فاتحة</figcaption><div className={b.bar} data-tone="light"><Wordmark brand={view} tone="light" /></div></figure>
          <figure><figcaption>الشريط فوق مشهد داكن</figcaption><div className={b.bar} data-tone="dark"><Wordmark brand={view} tone="dark" /></div></figure>
          <figure>
            <figcaption>الستار الافتتاحي (متحرك) <button type="button" className={b.replay} onClick={() => setReplay((n) => n + 1)}>إعادة الحركة</button></figcaption>
            <div className={b.curtain} key={replay}>
              {big.light || big.dark ? <LogoMark pair={big} alt="" height={big === view.lockup ? 96 : 72} tone="dark" className="logo-motion" /> : <Emblem size={80} draw />}
            </div>
          </figure>
          <figure><figcaption>التذييل</figcaption><div className={b.bar} data-tone="dark"><Wordmark brand={view} tone="dark" /><span className={b.with}>إحدى مبادرات {view.companyName}</span></div></figure>
          <figure><figcaption>رأس الشهادة — شعار الأكاديمية وحده</figcaption>
            <div className={b.cert}><LogoMark pair={big} alt={view.name} height={big === view.lockup ? 64 : 40} tone="light" /></div>
          </figure>
          <figure><figcaption>رأس البريد</figcaption><div className={b.mail}><LogoMark pair={view.academy} alt={view.name} height={30} tone="dark" />{(v.showName || !(view.academy.light || view.academy.dark)) && <strong>{view.name}</strong>}</div></figure>
        </div>
      </Section>
      <SaveBar dirty={dirty} saving={saving || !!busy} message={msg} onSave={save} />
    </>
  )
}
