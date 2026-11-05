'use client'
/* محرّر الدورة — تبويبات، ومعاينة حيّة للبطاقة كما ستظهر في الموقع، وحفظ بشريط ثابت. */
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { InstructorRow, Media, TrackRow } from '@/server/db/schema'
import type { Course, CourseStatus } from '@/content/types'
import { DELIVERY, LESSON_TYPE, LEVEL } from '@/lib/enums'
import { levelLabel, modeLabel } from '@/lib/course-meta'
import { priceView } from '@/lib/pricing'
import { saveCourse, trash } from '@/admin/actions'
import type { CourseInput, Errors } from '@/admin/schemas'

type Curriculum = CourseInput['curriculum']
import { CourseCard } from '@/components/CourseCard'
import {
  DateTime, FaqEditor, Field, Grid, Input, ListEditor, Money, PageHead, RowTools, SaveBar, Section, Segmented, Select, Switch, Textarea, useSortable,
} from '@/admin/ui/kit'
import { MediaPicker, urlOf } from '@/admin/ui/MediaPicker'
import { STATUS_HINT, STATUS_LABEL, STATUS_ORDER } from './labels'
import { LessonDetail } from './LessonDetail'
import { DEFAULT_RULES } from '@/lib/certificate'
import styles from './editor.module.css'

const TABS = [
  ['basics', 'الأساسيات'], ['pricing', 'التسعير والعروض'], ['schedule', 'الموعد والمكان'], ['content', 'المحتوى'],
  ['curriculum', 'المنهج'], ['certificate', 'الشهادة'], ['people', 'المدربون'], ['publish', 'النشر والظهور'],
] as const
type Tab = (typeof TABS)[number][0]

const LESSON_LABEL: Record<(typeof LESSON_TYPE)[number], string> = {
  video: 'فيديو', article: 'مقال', file: 'ملف', quiz: 'اختبار', live: 'جلسة مباشرة', onsite: 'جلسة حضورية', assignment: 'واجب',
}

const slugify = (t: string) =>
  t.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 60)

type Props = {
  id: string | null
  initial: CourseInput
  previewToken?: string
  tracks: TrackRow[]
  instructors: InstructorRow[]
  media: Media[]
  templates: { id: string; name: string }[]
}

export function CourseEditor({ id, initial, previewToken, tracks, instructors, media, templates }: Props) {
  const router = useRouter()
  const [v, setV] = useState<CourseInput>(initial)
  const [saved, setSaved] = useState(JSON.stringify(initial))
  const [tab, setTab] = useState<Tab>('basics')
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [slugTouched, setSlugTouched] = useState(!!id)
  const dirty = JSON.stringify(v) !== saved

  const set = <K extends keyof CourseInput>(k: K, val: CourseInput[K]) => { setV((o) => ({ ...o, [k]: val })); setMsg(null) }
  const err = (k: string) => errors[k]

  /* تحذير عند مغادرة صفحة بتغييرات غير محفوظة */
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault() }
    addEventListener('beforeunload', h)
    return () => removeEventListener('beforeunload', h)
  }, [dirty])

  const save = async () => {
    setSaving(true)
    let r = await saveCourse(id, v)
    if (!r.ok && r.confirm && window.confirm(r.confirm)) r = await saveCourse(id, v, { confirmDrop: true })
    setSaving(false)
    if (!r.ok) {
      setErrors(r.errors)
      setMsg({ ok: false, text: r.message ?? 'راجع الحقول' })
      const first = Object.keys(r.errors)[0] ?? ''
      const where: Tab = /price|compare|sale|free|tiers|groupRules/.test(first) ? 'pricing' : /starts|ends|seats|city|venue|hours/.test(first) ? 'schedule'
        : /curriculum/.test(first) ? 'curriculum' : /publish|seo/.test(first) ? 'publish' : 'basics'
      setTab(where)
      return
    }
    setErrors({})
    setSaved(JSON.stringify(v))
    setMsg({ ok: true, text: 'حُفظت — ظهرت التغييرات في الموقع' })
    if (!id) router.replace(`/admin/courses/${r.id}`)
    else router.refresh()
  }

  /* المعاينة الحيّة */
  const preview: Course = useMemo(() => {
    const t = tracks.find((x) => x.id === v.trackId)
    const cover = media.find((m) => m.id === v.coverId)
    const inst = v.instructorIds.map((iid) => instructors.find((x) => x.id === iid)?.slug).filter(Boolean) as string[]
    return {
      slug: v.slug || 'preview', title: v.title || 'عنوان الدورة', subtitle: v.subtitle, track: t?.slug ?? '', level: v.level, mode: v.mode,
      status: (v.status === 'draft' || v.status === 'scheduled' || v.status === 'archived' ? 'open' : v.status) as CourseStatus,
      startsAt: v.startsAt ?? undefined, hours: v.hours, city: v.city || undefined,
      seats: v.seatsTotal ? { total: v.seatsTotal, taken: Math.min(v.seatsTaken, v.seatsTotal) } : undefined,
      pricing: { amount: v.price, compareAt: v.compareAt ?? undefined, saleEndsAt: v.saleEndsAt ?? undefined, free: v.free },
      instructor: inst[0] ?? '', instructors: inst,
      cover: cover ? { url: urlOf(cover), alt: cover.alt, x: cover.focalX, y: cover.focalY, w: cover.width, h: cover.height } : undefined,
    }
  }, [v, tracks, instructors, media])
  const pTrack = tracks.find((x) => x.id === v.trackId)
  const pInst = instructors.find((x) => x.id === v.instructorIds[0])
  const pv = priceView(preview.pricing)

  return (
    <>
      <PageHead
        title={id ? v.title || 'دورة' : 'دورة جديدة'}
        sub={id ? `/${v.slug}` : 'ابدأ بالعنوان والمسار، ثم أكمل بقية التبويبات'}
        actions={id && previewToken ? <><a className="btn ghost" href={`/admin/courses/${id}/learners`}>المسجّلون</a><a className="btn ghost" href={`/courses/${v.slug}/preview/${previewToken}`} target="_blank" rel="noreferrer">معاينة الصفحة ↗</a></> : null}
      />

      <div className={styles.layout}>
        <div className={styles.form}>
          <nav className={styles.tabs} role="tablist">
            {TABS.map(([k, label]) => {
              const has = Object.keys(errors).some((e) => tabOf(e) === k)
              return <button key={k} role="tab" aria-selected={tab === k} data-err={has ? '1' : '0'} onClick={() => setTab(k)}>{label}</button>
            })}
          </nav>

          {tab === 'basics' && (
            <Section title="الأساسيات" desc="ما يراه الزائر أولاً في البطاقة وصفحة الدورة">
              <Field label="عنوان الدورة" error={err('title')} wide>
                <Input value={v.title} onChange={(e) => { const t = e.target.value; setV((o) => ({ ...o, title: t, slug: slugTouched ? o.slug : slugify(t) || o.slug })) }} placeholder="مثال: صياغة العقود التجارية" />
              </Field>
              <Field label="العنوان الفرعي" hint="سطر واحد يلخّص قيمة الدورة" wide>
                <Input value={v.subtitle} onChange={(e) => set('subtitle', e.target.value)} />
              </Field>
              <Grid>
                <Field label="رابط الصفحة" error={err('slug')} hint={`/courses/${v.slug || '…'}`}>
                  <Input dir="ltr" value={v.slug} onChange={(e) => { setSlugTouched(true); set('slug', e.target.value.toLowerCase()) }} placeholder="contract-drafting" />
                </Field>
                <Field label="المسار">
                  <Select value={v.trackId ?? ''} onChange={(x) => set('trackId', x || null)} options={[{ value: '', label: '— بلا مسار —' }, ...tracks.map((t) => ({ value: t.id, label: t.title }))]} />
                </Field>
              </Grid>
              <Field label="المستوى (درجة السُّلّم)">
                <Segmented value={v.level} onChange={(x) => set('level', x)} options={LEVEL.map((l) => ({ value: l, label: levelLabel[l] }))} />
              </Field>
              <Field label="نمط التقديم">
                <Segmented value={v.mode} onChange={(x) => set('mode', x)} options={DELIVERY.map((m) => ({ value: m, label: modeLabel[m] }))} />
              </Field>
              <Field label="صورة الغلاف" hint="بدونها تظهر بطاقة بحرف المسار. اضبط نقطة التركيز من المكتبة.">
                <MediaPicker value={v.coverId} onChange={(x) => set('coverId', x)} library={media} label="صورة الغلاف" />
              </Field>
            </Section>
          )}

          {tab === 'pricing' && (
            <Section title="التسعير والعروض" desc="السعر الأصلي يظهر مشطوباً بجانب سعر العرض، ويعود تلقائياً عند انتهاء العرض">
              <Switch checked={v.free} onChange={(x) => set('free', x)} label="دورة مجانية" />
              {!v.free && (
                <>
                  <Grid>
                    <Field label="السعر الحالي (شامل الضريبة)" error={err('price')}>
                      <Money value={v.price} onChange={(x) => set('price', x ?? 0)} placeholder="2490" />
                    </Field>
                    <Field label="السعر قبل العرض" error={err('compareAt')} hint="اتركه فارغاً إن لم يكن عرض">
                      <Money value={v.compareAt} onChange={(x) => set('compareAt', x)} placeholder="3490" />
                    </Field>
                  </Grid>
                  <Field label="نهاية العرض" hint="يظهر عدّاد تنازلي، وبعد الموعد يعود السعر الأصلي تلقائياً">
                    <DateTime value={v.saleEndsAt} onChange={(x) => set('saleEndsAt', x)} />
                  </Field>
                </>
              )}
              <div className={styles.priceNote}>
                {v.free ? 'ستظهر «مجاناً».' : pv.original ? `ستظهر بخصم ${pv.savePct}% — يدفع المتدرب ${(pv.current / 100).toLocaleString('en-US')} ريالاً.` : 'ستظهر بسعر واحد بلا عرض.'}
                <span>{v.tiers.length ? 'للدورة باقات — سعر الباقة يحلّ محل السعر الأساسي، ونهاية العرض تسري على الباقات أيضاً.' : 'الكوبونات تُدار من قسم المبيعات ← الكوبونات.'}</span>
              </div>
            </Section>
          )}
          {tab === 'pricing' && !v.free && <TiersEditor value={v.tiers} onChange={(x) => set('tiers', x)} errors={errors} />}
          {tab === 'pricing' && !v.free && <GroupEditor value={v.groupRules} onChange={(x) => set('groupRules', x)} error={errors.groupRules} />}

          {tab === 'schedule' && (
            <Section title="الموعد والمكان" desc={v.mode === 'recorded' ? 'الدورة المسجّلة تبدأ متى شاء المتدرب — المواعيد اختيارية' : 'الجلسات التفصيلية تُضاف في المنهج'}>
              <Grid>
                <Field label="تاريخ البدء"><DateTime value={v.startsAt} onChange={(x) => set('startsAt', x)} /></Field>
                <Field label="تاريخ الانتهاء" error={err('endsAt')}><DateTime value={v.endsAt} onChange={(x) => set('endsAt', x)} /></Field>
              </Grid>
              <Grid cols={3}>
                <Field label="عدد الساعات"><Input type="number" dir="ltr" min={0} step={0.5} value={v.hours} onChange={(e) => set('hours', Number(e.target.value))} /></Field>
                <Field label="السعة (مقاعد)" hint="فارغ = بلا حد"><Input type="number" dir="ltr" min={1} value={v.seatsTotal ?? ''} onChange={(e) => set('seatsTotal', e.target.value ? Number(e.target.value) : null)} /></Field>
                <Field label="محجوز يدوياً" error={err('seatsTaken')} hint="تُضاف إليه التسجيلات الفعلية"><Input type="number" dir="ltr" min={0} value={v.seatsTaken} onChange={(e) => set('seatsTaken', Number(e.target.value))} /></Field>
              </Grid>
              {(v.mode === 'onsite' || v.mode === 'blended') && (
                <Grid>
                  <Field label="المدينة"><Input value={v.city} onChange={(e) => set('city', e.target.value)} placeholder="الرياض" /></Field>
                  <Field label="رابط الخريطة" error={err('venueMapUrl')}><Input dir="ltr" value={v.venueMapUrl} onChange={(e) => set('venueMapUrl', e.target.value)} placeholder="https://maps.google.com/…" /></Field>
                  <Field label="المقر وتعليمات الوصول" wide hint="القاعة، المواقف، تعليمات الدخول — تظهر للمسجّلين وفي التذكيرات">
                    <Textarea rows={3} value={v.venue} onChange={(e) => set('venue', e.target.value)} />
                  </Field>
                </Grid>
              )}
            </Section>
          )}

          {tab === 'content' && (
            <>
              <Section title="الوصف" desc="فقرات، وعناوين تبدأ بـ ## ، وقوائم تبدأ بـ -">
                <Textarea rows={10} value={v.description} onChange={(e) => set('description', e.target.value)} />
              </Section>
              <Section title="ستتمكّن من…" desc="نتائج التعلّم — تظهر بارزة في أعلى صفحة الدورة">
                <ListEditor value={v.outcomes} onChange={(x) => set('outcomes', x)} placeholder="مثال: صياغة بنود المسؤولية بدقة" add="نتيجة" />
              </Section>
              <Grid>
                <Section title="لمن هذه الدورة"><ListEditor value={v.audience} onChange={(x) => set('audience', x)} add="فئة" /></Section>
                <Section title="المتطلبات"><ListEditor value={v.requirements} onChange={(x) => set('requirements', x)} add="متطلب" /></Section>
              </Grid>
              <Section title="الأسئلة الشائعة"><FaqEditor value={v.faq} onChange={(x) => set('faq', x)} /></Section>
            </>
          )}

          {tab === 'curriculum' && (
            <>
              <Section title="قواعد التعلّم" desc="تُطبَّق على كل المسجّلين">
                <Grid>
                  <Field label="التسلسل" hint="لا يُفتح الدرس حتى يكتمل الذي قبله">
                    <Switch checked={v.sequential ?? false} onChange={(x) => set('sequential', x)} label="إلزام الترتيب" />
                  </Field>
                  <Field label="اكتمال الفيديو عند مشاهدة %" hint="نسبة ما يُشاهَد فعلاً من الفيديو ليُعدّ مكتملاً" error={err('completeAt')}>
                    <Input type="number" dir="ltr" min={50} max={100} value={v.completeAt ?? 90} onChange={(e) => set('completeAt', Number(e.target.value))} />
                  </Field>
                </Grid>
              </Section>
              <CurriculumEditor value={v.curriculum} onChange={(x) => set('curriculum', x)} errors={errors} />
            </>
          )}

          {tab === 'certificate' && (() => {
            const c = v.certificate ?? DEFAULT_RULES
            const setC = (p: Partial<typeof c>) => set('certificate', { ...c, ...p })
            return (
              <Section title="شهادة الإتمام" desc="تُفحص الشروط تلقائياً بعد كل تقدّم، ثم تنتظر المراجعة أو تُصدر فوراً">
                <Switch checked={c.enabled} onChange={(enabled) => setC({ enabled })} label={c.enabled ? 'الدورة تمنح شهادة' : 'بلا شهادة'} />
                {c.enabled && (
                  <Grid>
                    <Field label="نسبة إكمال الدروس %" hint="الفيديو والمقالات والملفات والاختبارات والواجبات" error={err('certificate.lessonsPct')}>
                      <Input type="number" dir="ltr" min={0} max={100} value={c.lessonsPct} onChange={(e) => setC({ lessonsPct: Number(e.target.value) })} />
                    </Field>
                    <Field label="نسبة حضور الجلسات %" hint="المباشرة والحضورية — 0 بلا شرط حضور" error={err('certificate.attendancePct')}>
                      <Input type="number" dir="ltr" min={0} max={100} value={c.attendancePct} onChange={(e) => setC({ attendancePct: Number(e.target.value) })} />
                    </Field>
                    <Field label="الاختبارات"><Switch checked={c.quizzes} onChange={(quizzes) => setC({ quizzes })} label="النجاح في كل الاختبارات" /></Field>
                    <Field label="الواجبات"><Switch checked={c.assignments} onChange={(assignments) => setC({ assignments })} label="قبول كل الواجبات" /></Field>
                    <Field label="الاعتماد" hint="بلا مراجعة: تُصدر فور استيفاء الشروط">
                      <Switch checked={c.autoApprove} onChange={(autoApprove) => setC({ autoApprove })} label={c.autoApprove ? 'اعتماد تلقائي' : 'بعد مراجعة الفريق'} />
                    </Field>
                    <Field label="قالب الشهادة">
                      <Select value={c.templateId ?? ''} onChange={(x) => setC({ templateId: x || null })} options={[{ value: '', label: 'القالب الافتراضي' }, ...templates.map((t) => ({ value: t.id, label: t.name }))]} />
                    </Field>
                  </Grid>
                )}
              </Section>
            )
          })()}

          {tab === 'people' && (
            <Section title="المدربون" desc="بالترتيب — الأول يظهر في البطاقة">
              <InstructorPicker all={instructors} value={v.instructorIds} onChange={(x) => set('instructorIds', x)} media={media} />
            </Section>
          )}

          {tab === 'publish' && (
            <>
              <Section title="الحالة" desc="تتحكم في الظهور والتسجيل فوراً">
                <div className={styles.statusGrid}>
                  {STATUS_ORDER.map((s) => (
                    <button type="button" key={s} className={styles.statusCard} aria-pressed={v.status === s} data-tone={s} onClick={() => set('status', s)}>
                      <strong>{STATUS_LABEL[s]}</strong>
                      <span>{STATUS_HINT[s]}</span>
                    </button>
                  ))}
                </div>
                {v.status === 'scheduled' && (
                  <Field label="موعد النشر" error={err('publishAt')}><DateTime value={v.publishAt} onChange={(x) => set('publishAt', x)} /></Field>
                )}
                <Switch checked={v.featured} onChange={(x) => set('featured', x)} label="دورة مميزة (تتقدّم في الرئيسية)" />
              </Section>
              <Section title="محركات البحث والمشاركة">
                <Field label="عنوان SEO" hint="فارغ = عنوان الدورة"><Input value={v.seoTitle} onChange={(e) => set('seoTitle', e.target.value)} /></Field>
                <Field label="وصف SEO" hint="حتى 160 حرفاً"><Textarea rows={2} value={v.seoDescription} onChange={(e) => set('seoDescription', e.target.value)} /></Field>
              </Section>
            </>
          )}

          <SaveBar
            dirty={dirty}
            saving={saving}
            message={msg}
            onSave={save}
            extra={id ? (
              <button type="button" className="btn ghost" onClick={async () => {
                if (!confirm('نقل الدورة إلى المحذوفات؟ يمكن استرجاعها لاحقاً.')) return
                await trash('course', id)
                router.push('/admin/courses')
              }}>حذف</button>
            ) : null}
          />
        </div>

        <aside className={styles.preview} aria-label="معاينة البطاقة">
          <span className={styles.previewLabel}>معاينة حيّة · كما ستظهر في الموقع</span>
          <div className={styles.previewStage}>
            <CourseCard still course={preview} track={pTrack ? { ...pTrack, courseCount: 0, cover: undefined } : undefined} instructor={pInst ? { ...pInst, photo: undefined } : undefined} />
          </div>
          {(v.status === 'draft' || v.status === 'scheduled' || v.status === 'archived') && (
            <p className={styles.previewNote}>الحالة «{STATUS_LABEL[v.status]}» — البطاقة لا تظهر للعموم الآن.</p>
          )}
        </aside>
      </div>
    </>
  )
}

function tabOf(key: string): Tab {
  if (/price|compare|sale|free|tiers|groupRules/.test(key)) return 'pricing'
  if (/starts|ends|seats|city|venue|hours/.test(key)) return 'schedule'
  if (/curriculum/.test(key)) return 'curriculum'
  if (/certificate/.test(key)) return 'certificate'
  if (/publish|seo/.test(key)) return 'publish'
  if (/outcomes|audience|requirements|faq|description/.test(key)) return 'content'
  return 'basics'
}

function CurriculumEditor({ value, onChange, errors }: { value: Curriculum; onChange: (v: Curriculum) => void; errors: Errors }) {
  const mods = useSortable(value, onChange)
  const setMod = (i: number, m: Curriculum[number]) => onChange(value.map((x, k) => (k === i ? m : x)))
  const total = value.reduce((a, m) => a + m.lessons.reduce((b, l) => b + l.minutes, 0), 0)
  return (
    <Section title="المنهج" desc={`${value.length} وحدات · ${value.reduce((a, m) => a + m.lessons.length, 0)} دروس · ${Math.round(total / 6) / 10} ساعة`}>
      <div className={styles.modules}>
        {value.map((m, i) => (
          <div key={m.id ?? i} className={styles.module} {...mods.props(i)}>
            <div className={styles.moduleHead}>
              <span className={`${styles.modNum} num`}>{i + 1}</span>
              <Input value={m.title} placeholder="عنوان الوحدة" onChange={(e) => setMod(i, { ...m, title: e.target.value })} data-err={errors[`curriculum.${i}.title`] ? '1' : '0'} />
              <RowTools i={i} n={value.length} move={mods.move} onRemove={() => confirm('حذف الوحدة ودروسها؟') && onChange(value.filter((_, k) => k !== i))} />
            </div>
            <LessonList value={m.lessons} onChange={(ls) => setMod(i, { ...m, lessons: ls })} errors={errors} prefix={`curriculum.${i}.lessons`} />
          </div>
        ))}
      </div>
      <button type="button" className="btn ghost" onClick={() => onChange([...value, { id: `new-${Date.now()}`, title: '', lessons: [] }])}>+ وحدة</button>
    </Section>
  )
}

function LessonList({ value, onChange, errors, prefix }: { value: Curriculum[number]['lessons']; onChange: (v: Curriculum[number]['lessons']) => void; errors: Errors; prefix: string }) {
  const { props, move } = useSortable(value, onChange)
  const [open, setOpen] = useState<string | null>(null)
  const bad = (i: number) => Object.keys(errors).some((k) => k.startsWith(`${prefix}.${i}.`) && !k.endsWith('.title'))
  const set = (i: number, patch: Partial<Curriculum[number]['lessons'][number]>) => onChange(value.map((l, k) => (k === i ? { ...l, ...patch } : l)))
  return (
    <div className={styles.lessons}>
      {value.map((l, i) => (
        <div key={l.id ?? i} className={styles.lessonWrap}>
        <div className={styles.lesson} {...props(i)}>
          <Input value={l.title} placeholder="عنوان الدرس" onChange={(e) => set(i, { title: e.target.value })} />
          <select className={styles.lessonType} value={l.type} onChange={(e) => set(i, { type: e.target.value as typeof l.type })}>
            {LESSON_TYPE.map((t) => <option key={t} value={t}>{LESSON_LABEL[t]}</option>)}
          </select>
          <label className={styles.minutes}><input type="number" dir="ltr" min={0} value={l.minutes} onChange={(e) => set(i, { minutes: Number(e.target.value) })} /> د</label>
          <label className={styles.previewChk}><input type="checkbox" checked={l.preview} onChange={(e) => set(i, { preview: e.target.checked })} /> معاينة مجانية</label>
          <button type="button" className={styles.detailBtn} aria-expanded={open === (l.id ?? String(i))} data-err={bad(i) ? '1' : '0'} onClick={() => setOpen(open === (l.id ?? String(i)) ? null : l.id ?? String(i))}>
            التفاصيل {open === (l.id ?? String(i)) ? '▴' : '▾'}
          </button>
          <RowTools i={i} n={value.length} move={move} onRemove={() => (!l.id || confirm(`حذف الدرس «${l.title || 'بلا عنوان'}»؟ يُحذف عند الحفظ.`)) && onChange(value.filter((_, k) => k !== i))} />
        </div>
        {open === (l.id ?? String(i)) && <LessonDetail value={l} onChange={(p) => set(i, p)} err={(k) => errors[`${prefix}.${i}.${k}`]} />}
        </div>
      ))}
      <button type="button" className={styles.addLesson} onClick={() => onChange([...value, { id: `new-${Date.now()}`, title: '', type: 'video', minutes: 0, preview: false }])}>+ درس</button>
    </div>
  )
}

function InstructorPicker({ all, value, onChange, media }: { all: InstructorRow[]; value: string[]; onChange: (v: string[]) => void; media: Media[] }) {
  const { props, move } = useSortable(value, onChange)
  const rest = all.filter((p) => !value.includes(p.id))
  const photo = (p: InstructorRow) => media.find((m) => m.id === p.photoId)
  return (
    <div className={styles.people}>
      {value.map((iid, i) => {
        const p = all.find((x) => x.id === iid)
        if (!p) return null
        const ph = photo(p)
        return (
          <div key={iid} className={styles.person} {...props(i)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <span className={styles.avatar}>{ph ? <img src={urlOf(ph)} alt="" /> : p.name.slice(0, 1)}</span>
            <div><strong>{p.name}</strong><span>{p.title}</span></div>
            {i === 0 && <span className={styles.lead}>رئيسي</span>}
            <RowTools i={i} n={value.length} move={move} onRemove={() => onChange(value.filter((x) => x !== iid))} />
          </div>
        )
      })}
      {rest.length > 0 && (
        <select className={styles.addPerson} value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])}>
          <option value="">+ أضف مدرباً…</option>
          {rest.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.title}</option>)}
        </select>
      )}
      <a href="/admin/instructors/new" target="_blank" className={styles.newPerson}>مدرب جديد ↗</a>
    </div>
  )
}

type Tiers = CourseInput['tiers']

function TiersEditor({ value, onChange, errors }: { value: Tiers; onChange: (v: Tiers) => void; errors: Errors }) {
  const { props, move } = useSortable(value, onChange)
  const set = (i: number, patch: Partial<Tiers[number]>) => onChange(value.map((t, k) => (k === i ? { ...t, ...patch } : t)))
  return (
    <Section title="الباقات" desc="اختياري — مثل: أساسية ومميزة مع جلسة خاصة. الباقة المميزة تظهر «الأكثر اختياراً».">
      {value.map((t, i) => (
        <div key={t.id ?? i} className={styles.module} {...props(i)}>
          <div className={styles.moduleHead}>
            <span className={`${styles.modNum} num`}>{i + 1}</span>
            <Input value={t.name} placeholder="اسم الباقة" onChange={(e) => set(i, { name: e.target.value })} data-err={errors[`tiers.${i}.name`] ? '1' : '0'} />
            <RowTools i={i} n={value.length} move={move} onRemove={() => onChange(value.filter((_, k) => k !== i))} />
          </div>
          <Grid cols={3}>
            <Field label="السعر"><Money value={t.price} onChange={(x) => set(i, { price: x ?? 0 })} /></Field>
            <Field label="قبل العرض" error={errors[`tiers.${i}.compareAt`]}><Money value={t.compareAt} onChange={(x) => set(i, { compareAt: x })} /></Field>
            <Field label="سعة الباقة" hint="فارغ = سعة الدورة"><Input type="number" dir="ltr" min={1} value={t.capacity ?? ''} onChange={(e) => set(i, { capacity: e.target.value ? Number(e.target.value) : null })} /></Field>
          </Grid>
          <Field label="وصف قصير"><Input value={t.description} onChange={(e) => set(i, { description: e.target.value })} /></Field>
          <Field label="المزايا"><ListEditor value={t.features} onChange={(x) => set(i, { features: x })} add="ميزة" /></Field>
          <Switch checked={t.highlight} onChange={(b) => onChange(value.map((x, k) => ({ ...x, highlight: k === i ? b : false })))} label="الأكثر اختياراً" />
        </div>
      ))}
      <button type="button" className="btn ghost" style={{ justifySelf: 'start' }} onClick={() => onChange([...value, { id: `new-${Date.now()}`, name: '', description: '', price: 0, compareAt: null, features: [], highlight: value.length === 1, capacity: null }])}>+ باقة</button>
    </Section>
  )
}

function GroupEditor({ value, onChange, error }: { value: CourseInput['groupRules']; onChange: (v: CourseInput['groupRules']) => void; error?: string }) {
  return (
    <Section title="خصم المقاعد الجماعية" desc="للفرق والمؤسسات: كلما زاد العدد زاد الخصم. تُطبَّق أعلى قاعدة منطبقة.">
      {value.map((g, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>من</span>
          <Input style={{ maxInlineSize: 90 }} type="number" dir="ltr" min={2} max={50} value={g.minQty} onChange={(e) => onChange(value.map((x, k) => (k === i ? { ...x, minQty: Number(e.target.value) } : x)))} />
          <span>مقاعد فأكثر ← خصم</span>
          <Input style={{ maxInlineSize: 90 }} type="number" dir="ltr" min={1} max={90} value={g.percent} onChange={(e) => onChange(value.map((x, k) => (k === i ? { ...x, percent: Number(e.target.value) } : x)))} />
          <span>%</span>
          <button type="button" className="btn ghost" style={{ minBlockSize: 36 }} onClick={() => onChange(value.filter((_, k) => k !== i))}>حذف</button>
        </div>
      ))}
      {error && <span style={{ color: 'var(--danger)', fontSize: 13, fontWeight: 600 }}>{error}</span>}
      <button type="button" className="btn ghost" style={{ justifySelf: 'start' }} onClick={() => onChange([...value, { minQty: (value.at(-1)?.minQty ?? 2) + 3, percent: (value.at(-1)?.percent ?? 5) + 5 }])}>+ قاعدة</button>
    </Section>
  )
}
