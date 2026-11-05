'use client'
/* تفاصيل الدرس داخل محرّر المنهج — تتبدّل الحقول بنوع الدرس:
   فيديو (Stream أو رابط + فصول)، مقال، ملف، اختبار (منشئ أسئلة)، واجب، جلسة مباشرة، جلسة حضورية.
   ومشترك للكل: الفتح المتدرّج، والنص، والمرفقات. */
import { useEffect, useRef, useState } from 'react'
import type { CourseInput } from '@/admin/schemas'
import type { Chapter, Quiz, QuizQuestion } from '@/lib/learning-types'
import { EMPTY_ASSIGNMENT, EMPTY_QUIZ } from '@/lib/learning-types'
import { DateTime, Field, Grid, Input, RowTools, Segmented, Switch, Textarea } from '@/admin/ui/kit'
import { streamCaptionAdd, streamCaptionAuto, streamCaptionsOf, streamStatus, streamUpload, uploadCaption, uploadLessonFile } from '@/admin/learning/actions'
import { CAPTION_LANGS } from '@/lib/captions'
import type { Caption } from '@/lib/learning-types'
import d from './lesson.module.css'
import { fileSize } from '@/lib/files'

type Lesson = CourseInput['curriculum'][number]['lessons'][number]
type Video = NonNullable<Lesson['video']>

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
const parseMmss = (v: string) => {
  const p = v.trim().split(':').map(Number)
  if (p.some((x) => !Number.isFinite(x) || x < 0)) return null
  return p.reduce((a, x) => a * 60 + x, 0)
}
const uid = () => Math.random().toString(36).slice(2, 8)

export function LessonDetail({ value: l, onChange, err, cohorts = 0 }: { value: Lesson; onChange: (patch: Partial<Lesson>) => void; err: (k: string) => string | undefined; cohorts?: number }) {
  const session = l.type === 'live' || l.type === 'onsite'
  return (
    <div className={d.panel}>
      {l.type === 'video' && <VideoField label="مصدر الفيديو" value={l.video ?? { provider: 'none' }} onChange={(video) => onChange({ video })} error={err('video.uid') ?? err('video.url')} />}
      {l.type === 'video' && <Chapters value={l.chapters ?? []} onChange={(chapters) => onChange({ chapters })} />}
      {l.type === 'video' && l.video?.provider === 'url' && <Captions value={l.captions ?? []} onChange={(captions) => onChange({ captions })} />}
      {l.type === 'video' && l.video?.provider === 'stream' && /^[a-f0-9]{32}$/.test(l.video.uid) && <StreamCaptions uid={l.video.uid} />}

      {session && cohorts > 0 && <p className={d.note} role="note">للدورة <span className="num">{cohorts}</span> دفعة — مواعيد كل دفعة وروابطها وتسجيلاتها في تبويب «الدفعات» تحلّ محل ما هنا لمتدربيها. ما هنا لمن ليس في دفعة، ولدفعة لم يُضبط لها موعد هذه الجلسة.</p>}
      {session && (
        <Grid>
          <Field label="يبدأ" hint="بتوقيت الرياض" error={err('startsAt')}><DateTime value={l.startsAt ?? null} onChange={(startsAt) => onChange({ startsAt })} /></Field>
          <Field label="ينتهي" error={err('endsAt')}><DateTime value={l.endsAt ?? null} onChange={(endsAt) => onChange({ endsAt })} /></Field>
          {l.type === 'live' && (
            <Field label="رابط الانضمام" hint="Zoom أو Teams أو Meet — لا يظهر إلا للمسجّل قبل الموعد بـ 15 دقيقة" error={err('joinUrl')} wide>
              <Input dir="ltr" value={l.joinUrl ?? ''} placeholder="https://" onChange={(e) => onChange({ joinUrl: e.target.value })} />
            </Field>
          )}
          {l.type === 'onsite' && (
            <Field label="المكان" hint="القاعة والدور وتعليمات الدخول — يُستعمل مقر الدورة إن تُرك فارغاً" wide>
              <Textarea value={l.location ?? ''} onChange={(e) => onChange({ location: e.target.value })} />
            </Field>
          )}
        </Grid>
      )}
      {l.type === 'live' && (
        <VideoField label="تسجيل الجلسة" hint="يظهر للمسجّلين تحت الجلسة بعد انتهائها" value={l.recording ?? { provider: 'none' }} onChange={(recording) => onChange({ recording: recording.provider === 'none' ? null : recording })} />
      )}

      {l.type === 'quiz' && <QuizBuilder value={(l.quiz as Quiz | null | undefined) ?? EMPTY_QUIZ} onChange={(quiz) => onChange({ quiz })} err={err} />}

      {l.type === 'assignment' && (() => {
        const a = l.assignment ?? EMPTY_ASSIGNMENT
        const set = (p: Partial<typeof a>) => onChange({ assignment: { ...a, ...p } })
        return (
          <Grid>
            <Field label="المطلوب من المتدرب" wide><Textarea value={a.instructions} onChange={(e) => set({ instructions: e.target.value })} /></Field>
            <Field label="الصيغ المقبولة" hint="مفصولة بفاصلة: pdf, docx">
              <Input dir="ltr" value={a.accept.join(', ')} onChange={(e) => set({ accept: e.target.value.toLowerCase().split(/[,\s،]+/).filter(Boolean) })} />
            </Field>
            <Field label="الحد الأقصى للحجم (م.ب)"><Input type="number" dir="ltr" min={1} max={25} value={a.maxSizeMb} onChange={(e) => set({ maxSizeMb: Number(e.target.value) })} /></Field>
            <Field label="مهلة التسليم (أيام من فتح الدرس)" hint="اتركه فارغاً بلا مهلة">
              <Input type="number" dir="ltr" min={1} value={a.dueDays ?? ''} onChange={(e) => set({ dueDays: e.target.value ? Number(e.target.value) : null })} />
            </Field>
          </Grid>
        )
      })()}

      <Field label={l.type === 'article' ? 'نص المقال' : 'نص مرافق'} hint="Markdown مبسّط: ## للعناوين، و- للقوائم">
        <Textarea value={l.body ?? ''} rows={l.type === 'article' ? 12 : 4} onChange={(e) => onChange({ body: e.target.value })} />
      </Field>

      <Attachments value={l.attachments ?? []} onChange={(attachments) => onChange({ attachments })} />

      <Drip value={l.drip ?? { mode: 'none', date: null, days: null }} onChange={(drip) => onChange({ drip })} />
    </div>
  )
}

export function VideoField({ label, hint, value, onChange, error }: { label: string; hint?: string; value: Video; onChange: (v: Video) => void; error?: string }) {
  const [busy, setBusy] = useState('')
  /* حالة ربط Stream — مقفل حتى تُضاف مفاتيحه، فيُقال ذلك قبل محاولة الرفع */
  const [stream, setStream] = useState<{ configured: boolean; problem?: string } | null>(null)
  useEffect(() => {
    if (value.provider !== 'stream' || stream) return
    let live = true
    streamStatus().then((s) => live && setStream(s)).catch(() => {})
    return () => { live = false }
  }, [value.provider, stream])
  const file = useRef<HTMLInputElement>(null)
  const upload = async (f: File) => {
    setBusy('جارٍ تجهيز الرفع…')
    const r = await streamUpload()
    if (!r.ok) { setBusy(r.error); return }
    const fd = new FormData()
    fd.append('file', f)
    setBusy('جارٍ الرفع إلى Stream…')
    const up = await fetch(r.uploadURL, { method: 'POST', body: fd })
    if (!up.ok) { setBusy('فشل الرفع'); return }
    onChange({ provider: 'stream', uid: r.uid })
    setBusy('رُفع — يعالجه Stream خلال دقائق')
  }
  return (
    <Field label={label} hint={hint} error={error}>
      <Segmented value={value.provider} onChange={(p) => onChange(p === 'none' ? { provider: 'none' } : p === 'url' ? { provider: 'url', url: '' } : { provider: 'stream', uid: '' })}
        options={[{ value: 'none', label: 'بلا' }, { value: 'stream', label: 'Cloudflare Stream' }, { value: 'url', label: 'رابط مباشر' }]} />
      {value.provider === 'url' && <Input dir="ltr" value={value.url} placeholder="https://…/video.mp4" onChange={(e) => onChange({ provider: 'url', url: e.target.value })} />}
      {value.provider === 'stream' && (
        <div className={d.row}>
          <Input dir="ltr" value={value.uid} placeholder="معرّف الفيديو (32 حرفاً)" onChange={(e) => onChange({ provider: 'stream', uid: e.target.value.trim() })} />
          <input ref={file} type="file" accept="video/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <button type="button" className="btn ghost" onClick={() => file.current?.click()} disabled={stream?.configured === false} aria-disabled={stream?.configured === false}>رفع فيديو</button>
        </div>
      )}
      {value.provider === 'stream' && stream?.configured === false && (
        <span className={d.note} role="status">Stream غير مربوط: {stream.problem}. لن يُشغَّل الفيديو حتى تُضاف المفاتيح — استعمل «رابط مباشر» إلى ذلك الحين.</span>
      )}
      {busy && <span className={d.note} role="status">{busy}</span>}
    </Field>
  )
}

/** ترجمات الفيديو المباشر: ملف VTT أو SRT لكل لغة */
function Captions({ value, onChange }: { value: Caption[]; onChange: (v: Caption[]) => void }) {
  const [lang, setLang] = useState<string>(CAPTION_LANGS[0].lang)
  const [msg, setMsg] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const add = async (f: File) => {
    const label = CAPTION_LANGS.find((x) => x.lang === lang)?.label ?? lang
    const fd = new FormData()
    fd.set('file', f); fd.set('lang', lang); fd.set('label', label)
    setMsg('يُرفع…')
    const r = await uploadCaption(fd)
    if (!r.ok) return setMsg(r.error)
    onChange([...value.filter((c) => c.lang !== lang), r.caption])
    setMsg('')
  }
  return (
    <Field label="الترجمة النصية" hint="ملف WebVTT أو SRT لكل لغة — يظهر زر الترجمة في المشغّل">
      <div className={d.list}>
        {value.map((c) => (
          <div key={c.lang} className={d.row}>
            <span>{c.label} <small dir="ltr">({c.lang})</small></span>
            <button type="button" className={d.x} aria-label={`حذف ترجمة ${c.label}`} onClick={() => onChange(value.filter((x) => x.lang !== c.lang))}>×</button>
          </div>
        ))}
        <div className={d.row}>
          <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="لغة الترجمة">{CAPTION_LANGS.map((x) => <option key={x.lang} value={x.lang}>{x.label}</option>)}</select>
          <input ref={file} type="file" accept=".vtt,.srt,text/vtt" hidden onChange={(e) => { if (e.target.files?.[0]) add(e.target.files[0]); e.target.value = '' }} />
          <button type="button" className={d.add} onClick={() => file.current?.click()}>+ ملف ترجمة</button>
        </div>
        {msg && <span className={d.note} role="status">{msg}</span>}
      </div>
    </Field>
  )
}

/** ترجمات فيديو Stream: تُحفظ في Stream نفسه — رفع ملف أو توليد آلي من الصوت */
function StreamCaptions({ uid }: { uid: string }) {
  const [list, setList] = useState<{ language: string; label: string; status?: string }[] | null>(null)
  const [msg, setMsg] = useState('')
  const [lang, setLang] = useState<string>(CAPTION_LANGS[0].lang)
  const file = useRef<HTMLInputElement>(null)
  const [stream, setStream] = useState<{ configured: boolean; problem?: string } | null>(null)
  useEffect(() => {
    let live = true
    streamStatus().then((x) => live && setStream(x)).catch((e) => console.error('stream status', e))
    streamCaptionsOf(uid).then((x) => live && setList(x)).catch((e) => console.error('stream captions', e))
    return () => { live = false }
  }, [uid])
  const refresh = async () => setList(await streamCaptionsOf(uid))
  /* بلا مفاتيح Stream: القسم مقفل بسبب واضح — لا أزرار تفشل */
  if (stream?.configured === false) return <Field label="الترجمة النصية (Stream)"><span className={d.note}>مقفل — {stream.problem}</span></Field>
  return (
    <Field label="الترجمة النصية (Stream)" hint="يعرضها مشغّل Stream بزر الترجمة">
      <div className={d.list}>
        {list === null ? <span className={d.note}>يُحمَّل…</span> : list.length === 0 ? <span className={d.note}>لا ترجمات بعد.</span> : list.map((c) => <span key={c.language} className={d.note}>{c.label} ({c.language}){c.status && c.status !== 'ready' ? ` — ${c.status}` : ''}</span>)}
        <div className={d.row}>
          <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="لغة الترجمة">{CAPTION_LANGS.map((x) => <option key={x.lang} value={x.lang}>{x.label}</option>)}</select>
          <input ref={file} type="file" accept=".vtt,.srt,text/vtt" hidden onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = ''
            if (!f) return
            const fd = new FormData(); fd.set('uid', uid); fd.set('lang', lang); fd.set('file', f)
            const r = await streamCaptionAdd(fd); setMsg(r.ok ? 'رُفعت الترجمة' : r.error ?? ''); if (r.ok) refresh()
          }} />
          <button type="button" className={d.add} onClick={() => file.current?.click()}>+ ملف</button>
          <button type="button" className={d.add} onClick={async () => { const r = await streamCaptionAuto(uid, lang); setMsg(r.ok ? 'بدأ التوليد — يظهر خلال دقائق' : r.error ?? ''); if (r.ok) refresh() }}>توليد تلقائي</button>
        </div>
        {msg && <span className={d.note} role="status">{msg}</span>}
      </div>
    </Field>
  )
}

function Chapters({ value, onChange }: { value: Chapter[]; onChange: (v: Chapter[]) => void }) {
  const set = (i: number, c: Chapter) => onChange(value.map((x, k) => (k === i ? c : x)).sort((a, b) => a.at - b.at))
  return (
    <Field label="فصول الفيديو" hint="تظهر علامات على شريط التقدّم وقائمة للقفز">
      <div className={d.list}>
        {value.map((c, i) => (
          <div key={i} className={d.row}>
            {/* المفتاح بالوقت نفسه: بعد الحذف أو إعادة الترتيب يُعاد رسم الحقل بقيمته الصحيحة لا بقيمة صف آخر */}
            <Input key={`${i}:${c.at}`} className={d.time} dir="ltr" defaultValue={mmss(c.at)} aria-label="الوقت" onBlur={(e) => { const t = parseMmss(e.target.value); if (t !== null && t !== c.at) set(i, { ...c, at: t }) }} />
            <Input value={c.title} placeholder="عنوان الفصل" onChange={(e) => set(i, { ...c, title: e.target.value })} />
            <button type="button" className={d.x} aria-label="حذف الفصل" onClick={() => onChange(value.filter((_, k) => k !== i))}>×</button>
          </div>
        ))}
        <button type="button" className={d.add} onClick={() => onChange([...value, { at: value.length ? value[value.length - 1].at + 60 : 0, title: '' }])}>+ فصل</button>
      </div>
    </Field>
  )
}

function Attachments({ value, onChange }: { value: { assetId: string; name: string; size: number }[]; onChange: (v: { assetId: string; name: string; size: number }[]) => void }) {
  const [msg, setMsg] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const add = async (files: FileList) => {
    const next = [...value]
    for (const f of Array.from(files)) {
      setMsg(`جارٍ رفع ${f.name}…`)
      const fd = new FormData()
      fd.append('file', f)
      const r = await uploadLessonFile(fd)
      if (!r.ok) { setMsg(r.error); return }
      next.push(r.file)
    }
    onChange(next)
    setMsg('')
  }
  return (
    <Field label="المرفقات" hint="ملفات خاصة لا ينزّلها إلا المسجّل (أو أي زائر إن كان الدرس معاينة)">
      <div className={d.list}>
        {value.map((a, i) => (
          <div key={a.assetId} className={d.file}>
            <a href={`/admin/files/${a.assetId}`}>⇩ {a.name}</a><small className="num">{fileSize(a.size)}</small>
            <button type="button" className={d.x} aria-label={`إزالة ${a.name}`} onClick={() => onChange(value.filter((_, k) => k !== i))}>×</button>
          </div>
        ))}
        <input ref={input} type="file" multiple hidden onChange={(e) => e.target.files?.length && add(e.target.files)} />
        <button type="button" className={d.add} onClick={() => input.current?.click()}>+ رفع ملف</button>
        {msg && <span className={d.note} role="status">{msg}</span>}
      </div>
    </Field>
  )
}

function Drip({ value, onChange }: { value: { mode: 'none' | 'date' | 'days'; date: string | null; days: number | null }; onChange: (v: typeof value) => void }) {
  return (
    <Field label="الفتح المتدرّج" hint="متى يُتاح الدرس للمسجّل">
      <Segmented value={value.mode} onChange={(mode) => onChange({ mode, date: mode === 'date' ? value.date : null, days: mode === 'days' ? value.days ?? 7 : null })}
        options={[{ value: 'none', label: 'فوراً' }, { value: 'date', label: 'في تاريخ' }, { value: 'days', label: 'بعد أيام من التسجيل' }]} />
      {value.mode === 'date' && <DateTime value={value.date} onChange={(date) => onChange({ ...value, date })} />}
      {value.mode === 'days' && <Input type="number" dir="ltr" min={0} value={value.days ?? 0} onChange={(e) => onChange({ ...value, days: Number(e.target.value) })} />}
    </Field>
  )
}

const KIND: { value: QuizQuestion['kind']; label: string }[] = [
  { value: 'single', label: 'اختيار واحد' }, { value: 'multi', label: 'اختيارات متعددة' }, { value: 'truefalse', label: 'صح وخطأ' }, { value: 'case', label: 'حالة عملية' },
]

function QuizBuilder({ value: q, onChange, err }: { value: Quiz; onChange: (q: Quiz) => void; err: (k: string) => string | undefined }) {
  const set = (p: Partial<Quiz>) => onChange({ ...q, ...p })
  const setQ = (i: number, p: Partial<QuizQuestion>) => set({ questions: q.questions.map((x, k) => (k === i ? { ...x, ...p } : x)) })
  const move = (a: number, b: number) => { const n = [...q.questions]; const [x] = n.splice(a, 1); n.splice(b, 0, x); set({ questions: n }) }
  const blank = (kind: QuizQuestion['kind']): QuizQuestion => kind === 'truefalse'
    ? { id: uid(), kind, prompt: '', options: [{ id: 't', text: 'صح' }, { id: 'f', text: 'خطأ' }], correct: ['t'] }
    : { id: uid(), kind, prompt: '', options: [{ id: uid(), text: '' }, { id: uid(), text: '' }], correct: [] }
  return (
    <div className={d.quiz}>
      <Grid cols={3}>
        <Field label="درجة النجاح %"><Input type="number" dir="ltr" min={1} max={100} value={q.passPct} onChange={(e) => set({ passPct: Number(e.target.value) })} /></Field>
        <Field label="عدد المحاولات" hint="فارغ = بلا حد"><Input type="number" dir="ltr" min={1} value={q.attempts ?? ''} onChange={(e) => set({ attempts: e.target.value ? Number(e.target.value) : null })} /></Field>
        <Field label="المدة (دقائق)" hint="فارغ = بلا مؤقت"><Input type="number" dir="ltr" min={1} value={q.timeLimitMin ?? ''} onChange={(e) => set({ timeLimitMin: e.target.value ? Number(e.target.value) : null })} /></Field>
      </Grid>
      <div className={d.row}>
        <Switch checked={q.shuffle} onChange={(shuffle) => set({ shuffle })} label="ترتيب عشوائي لكل محاولة" />
        <Switch checked={q.showAnswers} onChange={(showAnswers) => set({ showAnswers })} label="إظهار الإجابات الصحيحة بعد التسليم" />
      </div>
      {q.questions.map((x, i) => (
        <div key={x.id} className={d.question}>
          <div className={d.qHead}>
            <span className={`${d.qNum} num`}>{i + 1}</span>
            <select className={d.kind} value={x.kind} aria-label="نوع السؤال" onChange={(e) => { const k = e.target.value as QuizQuestion['kind']; setQ(i, k === 'truefalse' ? blank(k) : { kind: k, correct: k === 'multi' ? x.correct : x.correct.slice(0, 1) }) }}>
              {KIND.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            <span style={{ flex: 1 }} />
            {/* وزن السؤال في الدرجة (يحسبه التصحيح منذ البداية) */}
            <label className={d.points}><Input type="number" dir="ltr" min={1} max={100} value={x.points ?? 1} aria-label="نقاط السؤال" onChange={(e) => setQ(i, { points: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })} /> نقطة</label>
            <RowTools i={i} n={q.questions.length} move={move} onRemove={() => set({ questions: q.questions.filter((_, k) => k !== i) })} />
          </div>
          {x.kind === 'case' && <Textarea value={x.caseText ?? ''} placeholder="نص الحالة العملية" onChange={(e) => setQ(i, { caseText: e.target.value })} />}
          <Input value={x.prompt} placeholder="نص السؤال" onChange={(e) => setQ(i, { prompt: e.target.value })} data-err={err(`quiz.questions.${i}.prompt`) ? '1' : '0'} />
          <div className={d.options} role="group" aria-label="الخيارات — حدّد الصحيح">
            {x.options.map((o, k) => (
              <div key={o.id} className={d.row}>
                <input type={x.kind === 'multi' ? 'checkbox' : 'radio'} name={`c-${x.id}`} aria-label="الإجابة الصحيحة" checked={x.correct.includes(o.id)}
                  onChange={(e) => setQ(i, { correct: x.kind === 'multi' ? (e.target.checked ? [...x.correct, o.id] : x.correct.filter((c) => c !== o.id)) : [o.id] })} />
                <Input value={o.text} placeholder={`الخيار ${k + 1}`} disabled={x.kind === 'truefalse'} onChange={(e) => setQ(i, { options: x.options.map((y) => (y.id === o.id ? { ...y, text: e.target.value } : y)) })} />
                {x.kind !== 'truefalse' && x.options.length > 2 && (
                  <button type="button" className={d.x} aria-label="حذف الخيار" onClick={() => setQ(i, { options: x.options.filter((y) => y.id !== o.id), correct: x.correct.filter((c) => c !== o.id) })}>×</button>
                )}
              </div>
            ))}
            {x.kind !== 'truefalse' && x.options.length < 10 && <button type="button" className={d.add} onClick={() => setQ(i, { options: [...x.options, { id: uid(), text: '' }] })}>+ خيار</button>}
          </div>
          {(err(`quiz.questions.${i}.correct`) || err(`quiz.questions.${i}.options`)) && <span className={d.err}>{err(`quiz.questions.${i}.correct`) ?? err(`quiz.questions.${i}.options`)}</span>}
          <Input value={x.explanation ?? ''} placeholder="شرح الإجابة (يظهر بعد التسليم — اختياري)" onChange={(e) => setQ(i, { explanation: e.target.value || undefined })} />
        </div>
      ))}
      <div className={d.row}>
        {KIND.map((k) => <button key={k.value} type="button" className="btn ghost" onClick={() => set({ questions: [...q.questions, blank(k.value)] })}>+ {k.label}</button>)}
      </div>
    </div>
  )
}
