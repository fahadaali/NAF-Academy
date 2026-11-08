'use client'
/* محرّر الرئيسية — النصوص، وترتيب المشاهد وإظهارها، ونقاط الكشيدة (~). */
import { History } from '@/admin/ui/History'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SCENE_LABEL, type HomeContent } from '@/content/home-defaults'
import { saveHome } from '@/admin/actions'
import { FaqEditor, Field, Grid, Input, ListEditor, PageHead, RowTools, SaveBar, Section, Switch, Textarea, useSortable } from '@/admin/ui/kit'
import { MediaPicker } from '@/admin/ui/MediaPicker'
import type { Media } from '@/server/db/schema'
import { plain } from '@/motion/kashida'
import p from '@/admin/ui/panel.module.css'

const KASHIDA_HINT = 'للتمدّد: ضع ~ ثم رقماً من 1 إلى 5 بين حرفين متصلين، مثل «بالمم~3ارسة»'

export function HomeEditor({ initial, media }: { initial: HomeContent; media: Media[] }) {
  const router = useRouter()
  const [v, setV] = useState(initial)
  const [saved, setSaved] = useState(JSON.stringify(initial))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const up = (fn: (o: HomeContent) => HomeContent) => { setV(fn); setMsg(null) }
  const sections = useSortable(v.sections, (x) => up((o) => ({ ...o, sections: x })))
  const stats = useSortable(v.stats, (x) => up((o) => ({ ...o, stats: x })))
  const head = (k: keyof HomeContent['heads'], f: 'eyebrow' | 'title', t: string) => up((o) => ({ ...o, heads: { ...o.heads, [k]: { ...o.heads[k], [f]: t } } }))

  return (
    <>
      <PageHead title="الصفحة الرئيسية" sub="كل ما يظهر في الرئيسية — يُنشر فور الحفظ" actions={<><History entity="home" id="home" current={v} onRestore={(x) => { setV(x); setMsg({ ok: true, text: 'حُمّلت النسخة — راجعها ثم احفظ' }) }} /><a className="btn ghost" href="/" target="_blank" rel="noreferrer">عرض ↗</a></>} />

      <Section title="ترتيب المشاهد" desc="اسحب لتغيير الترتيب، وأوقف ما لا تريد إظهاره. الافتتاح والتذييل ثابتان. «في القائمة» اسمه في شريط الموقع — اتركه فارغاً ليغيب عنها، والمخفي لا يظهر فيها أبداً.">
        {v.sections.map((x, i) => (
          <div key={x.key} className={p.sceneRow} data-hidden={x.visible ? '0' : '1'} {...sections.props(i)}>
            <strong>{i + 1}. {SCENE_LABEL[x.key]}</strong>
            <Input aria-label={`اسم «${SCENE_LABEL[x.key]}» في القائمة`} placeholder="لا يظهر في القائمة" value={x.menu ?? ''} className={p.fitM}
              onChange={(e) => up((o) => ({ ...o, sections: o.sections.map((y) => (y.key === x.key ? { ...y, menu: e.target.value } : y)) }))} />
            <Switch checked={x.visible} onChange={(b) => up((o) => ({ ...o, sections: o.sections.map((y) => (y.key === x.key ? { ...y, visible: b } : y)) }))} label={x.visible ? 'ظاهر' : 'مخفي'} />
            <RowTools i={i} n={v.sections.length} move={sections.move} />
          </div>
        ))}
      </Section>

      <Section title="الافتتاح" desc={KASHIDA_HINT}>
        <Field label="السطر الصغير"><Input value={v.hero.eyebrow} onChange={(e) => up((o) => ({ ...o, hero: { ...o.hero, eyebrow: e.target.value } }))} /></Field>
        <Field label="العنوان الكبير — سطر لكل حقل"><ListEditor value={v.hero.lines} onChange={(x) => up((o) => ({ ...o, hero: { ...o.hero, lines: x } }))} add="سطر" /></Field>
        <Field label="عبارات المراحل أثناء التمرير" hint="أربع عبارات تظهر مع تحوّل الجسيمات: الغبار، السطور، السُّلّم، العلامة">
          <ListEditor value={v.hero.phases.map((p) => p.text)} onChange={(x) => up((o) => ({ ...o, hero: { ...o.hero, phases: x.slice(0, 4).map((text, i) => ({ text, at: [0.1, 0.36, 0.6, 0.84][i] })) } }))} add="عبارة" />
        </Field>
        <Grid>
          <Field label="نص الزر"><Input value={v.hero.cta.label} onChange={(e) => up((o) => ({ ...o, hero: { ...o.hero, cta: { ...o.hero.cta, label: e.target.value } } }))} /></Field>
          <Field label="رابط الزر"><Input dir="ltr" value={v.hero.cta.href} onChange={(e) => up((o) => ({ ...o, hero: { ...o.hero, cta: { ...o.hero.cta, href: e.target.value } } }))} /></Field>
        </Grid>
      </Section>

      <Section title="سُلّم الكفاءة" desc="ثلاث درجات — اسم الدرجة يتمدّد بقدر الكشيدة التي تضعها">
        <Grid>
          <Field label="السطر الصغير"><Input value={v.heads.ladder.eyebrow} onChange={(e) => head('ladder', 'eyebrow', e.target.value)} /></Field>
          <Field label="العنوان"><Input value={v.ladder.title} onChange={(e) => up((o) => ({ ...o, ladder: { ...o.ladder, title: e.target.value } }))} /></Field>
        </Grid>
        {v.ladder.steps.map((st, i) => {
          const set = (patch: Partial<typeof st>) => up((o) => ({ ...o, ladder: { ...o.ladder, steps: o.ladder.steps.map((x, k) => (k === i ? { ...x, ...patch } : x)) } }))
          return (
            <div key={i} className={p.tileLg}>
              <Grid>
                <Field label={`الدرجة ${i + 1} — التسمية`}><Input value={st.name} onChange={(e) => set({ name: e.target.value })} /></Field>
                <Field label="الاسم" hint={`يظهر: ${plain(st.title)}`}><Input value={st.title} onChange={(e) => set({ title: e.target.value })} /></Field>
              </Grid>
              <Field label="الوصف"><Textarea rows={2} value={st.body} onChange={(e) => set({ body: e.target.value })} /></Field>
              <Field label="ما يكتسبه"><ListEditor value={st.gains} onChange={(x) => set({ gains: x })} add="مكتسب" /></Field>
            </div>
          )
        })}
      </Section>

      <Section title="عناوين الأقسام" desc={KASHIDA_HINT}>
        {(['tracks', 'courses', 'instructors', 'voices', 'partners', 'faq', 'corporate'] as const).map((k) => (
          <Grid key={k}>
            <Field label={`${SCENE_LABEL[k]} — السطر الصغير`}><Input value={v.heads[k].eyebrow} onChange={(e) => head(k, 'eyebrow', e.target.value)} /></Field>
            {k === 'corporate'
              ? <Field label="العنوان"><Input value={v.corporate.title} onChange={(e) => up((o) => ({ ...o, corporate: { ...o.corporate, title: e.target.value } }))} /></Field>
              : <Field label="العنوان"><Input value={v.heads[k].title} onChange={(e) => head(k, 'title', e.target.value)} /></Field>}
          </Grid>
        ))}
      </Section>

      <Section title="الأرقام" desc="تتصاعد عند الظهور">
        {v.stats.map((st, i) => (
          <div key={i} className={p.hstack} {...stats.props(i)}>
            <Input aria-label="الرقم" className={p.fitS} dir="ltr" type="number" value={st.value} onChange={(e) => up((o) => ({ ...o, stats: o.stats.map((x, k) => (k === i ? { ...x, value: Number(e.target.value) } : x)) }))} />
            <Input aria-label="اللاحقة" className={p.fitXs} placeholder="+ أو ٪" value={st.suffix ?? ''} onChange={(e) => up((o) => ({ ...o, stats: o.stats.map((x, k) => (k === i ? { ...x, suffix: e.target.value } : x)) }))} />
            <Input aria-label="التسمية" placeholder="التسمية" value={st.label} onChange={(e) => up((o) => ({ ...o, stats: o.stats.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) }))} />
            <RowTools i={i} n={v.stats.length} move={stats.move} onRemove={() => up((o) => ({ ...o, stats: o.stats.filter((_, k) => k !== i) }))} />
          </div>
        ))}
        <button type="button" className={`btn ghost ${p.start}`} onClick={() => up((o) => ({ ...o, stats: [...o.stats, { value: 0, label: '' }] }))}>+ رقم</button>
      </Section>

      <Section title="آراء المتدربين" desc="اقتباسات حقيقية بإذن أصحابها — يغيب المشهد ما دامت القائمة فارغة">
        {v.voices.map((x, i) => (
          <div key={i} className={p.tile}>
            <Textarea rows={2} aria-label="نص الرأي" placeholder="نص الرأي" value={x.quote} onChange={(e) => up((o) => ({ ...o, voices: o.voices.map((y, k) => (k === i ? { ...y, quote: e.target.value } : y)) }))} />
            <Grid cols={3}>
              <Input aria-label="الاسم" placeholder="الاسم" value={x.name} onChange={(e) => up((o) => ({ ...o, voices: o.voices.map((y, k) => (k === i ? { ...y, name: e.target.value } : y)) }))} />
              <Input aria-label="الصفة" placeholder="الصفة (محامٍ، مستشار في …)" value={x.role} onChange={(e) => up((o) => ({ ...o, voices: o.voices.map((y, k) => (k === i ? { ...y, role: e.target.value } : y)) }))} />
              <RowTools i={i} n={v.voices.length} move={(a, b) => up((o) => { const n = o.voices.slice(); const [m] = n.splice(a, 1); n.splice(b, 0, m); return { ...o, voices: n } })} onRemove={() => up((o) => ({ ...o, voices: o.voices.filter((_, k) => k !== i) }))} />
            </Grid>
            <MediaPicker label="الصورة (اختيارية)" value={x.photoId} onChange={(photoId) => up((o) => ({ ...o, voices: o.voices.map((y, k) => (k === i ? { ...y, photoId } : y)) }))} library={media} ratio="1 / 1" />
          </div>
        ))}
        <button type="button" className={`btn ghost ${p.start}`} disabled={v.voices.length >= 12} onClick={() => up((o) => ({ ...o, voices: [...o.voices, { quote: '', name: '', role: '', photoId: null }] }))}>+ رأي</button>
      </Section>

      <Section title="الجهات الشريكة" desc="شعار ورابط اختياري لكل جهة — يغيب المشهد ما دامت القائمة فارغة">
        {v.partners.map((x, i) => (
          <div key={i} className={p.tile}>
            <Grid cols={3}>
              <Input aria-label="اسم الجهة" placeholder="اسم الجهة" value={x.name} onChange={(e) => up((o) => ({ ...o, partners: o.partners.map((y, k) => (k === i ? { ...y, name: e.target.value } : y)) }))} />
              <Input aria-label="الرابط" placeholder="https://… (اختياري)" dir="ltr" value={x.url} onChange={(e) => up((o) => ({ ...o, partners: o.partners.map((y, k) => (k === i ? { ...y, url: e.target.value.trim() } : y)) }))} />
              <RowTools i={i} n={v.partners.length} move={(a, b) => up((o) => { const n = o.partners.slice(); const [m] = n.splice(a, 1); n.splice(b, 0, m); return { ...o, partners: n } })} onRemove={() => up((o) => ({ ...o, partners: o.partners.filter((_, k) => k !== i) }))} />
            </Grid>
            <MediaPicker label="الشعار (PNG شفاف يُفضَّل)" value={x.logoId} onChange={(logoId) => up((o) => ({ ...o, partners: o.partners.map((y, k) => (k === i ? { ...y, logoId } : y)) }))} library={media} ratio="3 / 1" />
          </div>
        ))}
        <button type="button" className={`btn ghost ${p.start}`} disabled={v.partners.length >= 24} onClick={() => up((o) => ({ ...o, partners: [...o.partners, { name: '', logoId: null, url: '' }] }))}>+ جهة</button>
      </Section>

      <Section title="الأسئلة الشائعة" desc="أسئلة عامة عن الأكاديمية (أسئلة كل دورة في صفحتها) — يغيب المشهد ما دامت فارغة">
        <FaqEditor value={v.faq} onChange={(faq) => up((o) => ({ ...o, faq }))} />
      </Section>

      <Section title="للمؤسسات">
        <Field label="الوصف"><Textarea rows={3} value={v.corporate.body} onChange={(e) => up((o) => ({ ...o, corporate: { ...o.corporate, body: e.target.value } }))} /></Field>
        <Grid>
          <Field label="خيارات حجم الفريق"><ListEditor value={v.corporate.sizes} onChange={(x) => up((o) => ({ ...o, corporate: { ...o.corporate, sizes: x } }))} /></Field>
          <Field label="مجالات الاهتمام"><ListEditor value={v.corporate.interests} onChange={(x) => up((o) => ({ ...o, corporate: { ...o.corporate, interests: x } }))} /></Field>
        </Grid>
      </Section>

      <Section title="التذييل" desc={KASHIDA_HINT}>
        <Grid>
          <Field label="العبارة الكبرى"><Input value={v.footer.title} onChange={(e) => up((o) => ({ ...o, footer: { ...o.footer, title: e.target.value } }))} /></Field>
          <Field label="نص الزر"><Input value={v.footer.cta} onChange={(e) => up((o) => ({ ...o, footer: { ...o.footer, cta: e.target.value } }))} /></Field>
        </Grid>
      </Section>

      <SaveBar dirty={JSON.stringify(v) !== saved} saving={saving} message={msg} onSave={async () => {
        setSaving(true)
        const r = await saveHome(v)
        setSaving(false)
        if (r.ok) { setSaved(JSON.stringify(v)); setMsg({ ok: true, text: 'نُشرت الرئيسية' }); router.refresh() }
        else setMsg({ ok: false, text: r.message ?? 'تعذّر الحفظ' })
      }} />
    </>
  )
}
