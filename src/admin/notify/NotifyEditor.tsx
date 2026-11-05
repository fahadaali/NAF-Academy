'use client'
/* محرّر الرسائل الآلية — قائمة الأحداث، وتحرير القالب بمتغيراته، ومعاينة حيّة (حاسب/جوال، فاتح/داكن)،
   وإرسال تجريبي، وتوقيتات التذكير. */
import { duration } from '@/motion/tokens'
import { History } from '@/admin/ui/History'
import { useEffect, useRef, useState } from 'react'
import { EVENTS, EVENT_META, VAR_LABEL, leftLabel, type Category, type EventKey, type NotifySettings, type Template } from '@/lib/notify'
import { Field, Grid, Input, SaveBar, Section, Segmented, Switch, Textarea } from '@/admin/ui/kit'
import { previewNotify, saveNotify, sendTest } from './actions'
import n from './notify.module.css'
import { useCan } from '@/admin/ui/perms'

const CAT: Record<Category, string> = { transactional: 'أساسية — تُرسل دائماً', engagement: 'تحفيز — يمكن إيقافها', marketing: 'عروض — يمكن إيقافها' }
const TIMING = 'timing' as const
type Pick = EventKey | typeof TIMING
type FieldKey = 'subject' | 'heading' | 'body' | 'cta' | 'cta2' | 'sms'

export function NotifyEditor({ initial, staffEmail }: { initial: NotifySettings; staffEmail: string }) {
  const [v, setV] = useState(initial)
  const [saved, setSaved] = useState(JSON.stringify(initial))
  const [pick, setPick] = useState<Pick>('enrolled')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const dirty = JSON.stringify(v) !== saved

  const save = async () => {
    setSaving(true); setMsg(null)
    const r = await saveNotify(v)
    setSaving(false)
    if (r.ok) { setSaved(JSON.stringify(v)); setErrors({}); setMsg({ ok: true, text: 'حُفظت الرسائل' }) }
    else { setErrors(r.errors ?? {}); setMsg({ ok: false, text: 'راجع الحقول المعلّمة' }) }
  }
  const setTpl = (e: EventKey, p: Partial<Template>) => { setV((o) => ({ ...o, templates: { ...o.templates, [e]: { ...o.templates[e], ...p } } })); setMsg(null) }
  const bad = (e: EventKey) => Object.keys(errors).some((k) => k.startsWith(`templates.${e}.`))

  return (
    <>
      <div className={n.layout}>
        <nav className={n.list} aria-label="الرسائل">
          <button className={n.item} aria-current={pick === TIMING ? 'true' : undefined} onClick={() => setPick(TIMING)}>
            <span>التوقيتات</span><small>متى تُرسل التذكيرات</small>
          </button>
          {(['transactional', 'engagement', 'marketing'] as Category[]).map((c) => (
            <div key={c} className={n.group}>
              <h2>{CAT[c]}</h2>
              {EVENTS.filter((e) => EVENT_META[e].category === c).map((e) => (
                <button key={e} className={n.item} aria-current={pick === e ? 'true' : undefined} data-off={v.templates[e].enabled ? '0' : '1'} data-err={bad(e) ? '1' : '0'} onClick={() => setPick(e)}>
                  <span>{EVENT_META[e].label}</span><small>{v.templates[e].enabled ? EVENT_META[e].hint : 'موقوفة'}</small>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className={n.main}>
          {pick === TIMING
            ? <Timing v={v} set={(p) => { setV((o) => ({ ...o, ...p })); setMsg(null) }} errors={errors} />
            : <TemplateEditor key={pick} event={pick} t={v.templates[pick]} set={(p) => setTpl(pick, p)} errors={errors} staffEmail={staffEmail} />}
        </div>
      </div>
      <SaveBar dirty={dirty} saving={saving} message={msg} onSave={save} extra={<History entity="settings" id="notify" current={v} onRestore={(x) => { setV(x); setMsg({ ok: true, text: 'حُمّلت النسخة — راجعها ثم احفظ' }) }} />} />
    </>
  )
}

function TemplateEditor({ event, t, set, errors, staffEmail }: { event: EventKey; t: Template; set: (p: Partial<Template>) => void; errors: Record<string, string>; staffEmail: string }) {
  const canLog = useCan()('messages.read')
  const meta = EVENT_META[event]
  const focus = useRef<{ k: FieldKey; el: HTMLInputElement | HTMLTextAreaElement } | null>(null)
  const [dark, setDark] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [pv, setPv] = useState<{ subject: string; html: string; sms: string } | null>(null)
  const [to, setTo] = useState(staffEmail)
  const [testMsg, setTestMsg] = useState('')
  const err = (k: string) => errors[`templates.${event}.${k}`]

  /* معاينة بعد توقف الكتابة */
  useEffect(() => {
    /* المعاينة بعد توقّف الكتابة */
    const id = setTimeout(() => { previewNotify(event, t, dark).then(setPv).catch((e) => console.error('notify preview', e)) }, duration.gentle)
    return () => clearTimeout(id)
  }, [event, t, dark])

  const insert = (name: string) => {
    const f = focus.current
    const tok = `{{${name}}}`
    if (!f) { set({ body: `${t.body}${tok}` }); return }
    const { selectionStart: a, selectionEnd: b, value } = f.el
    const next = value.slice(0, a ?? value.length) + tok + value.slice(b ?? value.length)
    set({ [f.k]: next } as Partial<Template>)
    requestAnimationFrame(() => { f.el.focus(); const p = (a ?? 0) + tok.length; f.el.setSelectionRange(p, p) })
  }
  const bind = (k: FieldKey) => ({
    value: t[k] ?? '',
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { focus.current = { k, el: e.currentTarget } },
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set({ [k]: e.target.value } as Partial<Template>),
  })

  return (
    <div className={n.editor}>
      <Section title={meta.label} desc={meta.hint} aside={<Switch checked={t.enabled} onChange={(enabled) => set({ enabled })} label={t.enabled ? 'مفعّلة' : 'موقوفة'} />}>
        <div className={n.vars} role="group" aria-label="إدراج متغير">
          <span>إدراج:</span>
          {meta.vars.map((x) => <button key={x} type="button" onClick={() => insert(x)} title={`{{${x}}}`}>{VAR_LABEL[x] ?? x}</button>)}
        </div>
        <Grid>
          <Field label="عنوان البريد" error={err('subject')} wide><Input {...bind('subject')} /></Field>
          <Field label="العنوان داخل الرسالة" error={err('heading')} wide><Input {...bind('heading')} /></Field>
          <Field label="النص" hint="سطر فارغ يفصل الفقرات، و«- » في أول السطر لقائمة" error={err('body')} wide><Textarea rows={7} {...bind('body')} /></Field>
          <Field label="نص الزر" hint="يقود إلى الدرس أو الدورة — اتركه فارغاً بلا زر" error={err('cta')}><Input {...bind('cta')} /></Field>
          {meta.cta2Var && <Field label={meta.cta2Var === 'review_url' ? 'زر التقييم' : 'زر LinkedIn'} hint={meta.cta2Var === 'review_url' ? 'يظهر لمن بلغ نسبة التقييم ولم يقيّم بعد — فارغ = بلا زر' : 'يفتح إضافة الشهادة إلى ملف LinkedIn — فارغ = بلا زر'} error={err('cta2')}><Input {...bind('cta2')} /></Field>}
          {meta.sms && <Field label="الرسالة النصية (الجوال)" hint={`${t.sms.length} حرفاً — فارغ = لا رسالة نصية`} error={err('sms')}><Textarea rows={3} {...bind('sms')} /></Field>}
        </Grid>
      </Section>

      <Section title="المعاينة" desc={pv ? `العنوان: ${pv.subject}` : 'ببيانات تجريبية'} aside={
        <div className={n.pvTools}>
          <Segmented value={mobile ? 'm' : 'd'} onChange={(x) => setMobile(x === 'm')} options={[{ value: 'd', label: 'حاسب' }, { value: 'm', label: 'جوال' }]} />
          <Segmented value={dark ? 'dark' : 'light'} onChange={(x) => setDark(x === 'dark')} options={[{ value: 'light', label: 'فاتح' }, { value: 'dark', label: 'داكن' }]} />
        </div>
      }>
        <div className={n.frameBox} data-mobile={mobile ? '1' : '0'}>
          {pv && <iframe title="معاينة البريد" className={n.frame} srcDoc={pv.html} sandbox="" />}
        </div>
        {meta.sms && pv?.sms && <div className={n.sms}><span>الجوال</span><p>{pv.sms}</p></div>}
        <div className={n.test}>
          <Input dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} aria-label="إرسال تجريبي إلى" placeholder="البريد أو الجوال" />
          <button type="button" className="btn ghost" onClick={async () => { setTestMsg('…'); const r = await sendTest(event, t, to, to.includes('@') ? 'email' : 'sms'); setTestMsg(r.ok ? (canLog ? 'أُرسلت التجربة — راجع سجل الرسائل' : 'أُرسلت التجربة') : r.error ?? 'تعذّر') }}>إرسال تجريبي</button>
          {testMsg && <span role="status" className={n.note}>{testMsg}</span>}
        </div>
      </Section>
    </div>
  )
}

const PRESETS = [7 * 1440, 3 * 1440, 1440, 180, 60, 30, 10]

function Timing({ v, set, errors }: { v: NotifySettings; set: (p: Partial<NotifySettings>) => void; errors: Record<string, string> }) {
  const has = (m: number) => v.sessionOffsets.find((o) => o.minutes === m)
  const toggle = (m: number, ch: 'email' | 'sms', on: boolean) => {
    const cur = has(m) ?? { minutes: m, email: false, sms: false }
    const next = { ...cur, [ch]: on }
    const rest = v.sessionOffsets.filter((o) => o.minutes !== m)
    set({ sessionOffsets: next.email || next.sms ? [...rest, next].sort((a, b) => b.minutes - a.minutes) : rest })
  }
  const num = (k: 'followupDelay' | 'inactiveDays' | 'saleHours') => ({ type: 'number' as const, dir: 'ltr' as const, min: 0, value: v[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => set({ [k]: Number(e.target.value) } as Partial<NotifySettings>) })
  return (
    <div className={n.editor}>
      <Section title="تذكيرات الجلسات" desc="قبل كل جلسة مباشرة أو حضورية — لكل توقيت قناته">
        <table className={n.offsets}>
          <thead><tr><th>قبل الجلسة</th><th>بريد</th><th>جوال</th></tr></thead>
          <tbody>{PRESETS.map((m) => (
            <tr key={m}>
              <td>{leftLabel(m).replace('بعد ', '').replace('غداً', 'يوم')}</td>
              <td><input type="checkbox" aria-label={`بريد قبل ${leftLabel(m)}`} checked={!!has(m)?.email} onChange={(e) => toggle(m, 'email', e.target.checked)} /></td>
              <td><input type="checkbox" aria-label={`جوال قبل ${leftLabel(m)}`} checked={!!has(m)?.sms} onChange={(e) => toggle(m, 'sms', e.target.checked)} /></td>
            </tr>
          ))}</tbody>
        </table>
        <p className={n.note}>لا يُرسل تذكير فات موعده (مثلاً من سجّل قبل الجلسة بيوم لا يصله تذكير الأسبوع)، ويُعاد الجدول تلقائياً إن تغيّر موعد الجلسة.</p>
      </Section>
      <Section title="توقيتات أخرى">
        <Grid>
          <Field label="ما بعد الجلسة (دقائق بعد نهايتها)" error={errors.followupDelay}><Input {...num('followupDelay')} /></Field>
          <Field label="التحفيز بعد التوقف (أيام)" hint="0 = بلا تحفيز" error={errors.inactiveDays}><Input {...num('inactiveDays')} /></Field>
          <Field label="قرب انتهاء العرض (ساعات قبله)" error={errors.saleHours}><Input {...num('saleHours')} /></Field>
          <Field label="السلة المتروكة (دقائق بعد الطلب)" hint="مفصولة بفاصلة: 60, 1440" error={errors.cartDelays}>
            <Input dir="ltr" defaultValue={v.cartDelays.join(', ')} onBlur={(e) => set({ cartDelays: e.target.value.split(/[,\s،]+/).map(Number).filter((x) => x > 0) })} />
          </Field>
          <Field label="كوبون التذكير الأخير للسلة" hint="اختياري — يجب أن يكون كوبوناً موجوداً" error={errors.cartCoupon}>
            <Input dir="ltr" value={v.cartCoupon} onChange={(e) => set({ cartCoupon: e.target.value.toUpperCase() })} />
          </Field>
        </Grid>
      </Section>
    </div>
  )
}
