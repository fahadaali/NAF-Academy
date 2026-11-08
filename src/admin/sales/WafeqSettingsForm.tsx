'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { WafeqSettings } from '@/lib/wafeq'
import type { WafeqCatalog, WafeqState } from '@/server/wafeq/client'
import { saveWafeqSettings, wafeqCatalogAction } from './actions'
import { ResyncWafeq } from './OrderTools'
import { Field, Grid, Input, PageHead, SaveBar, Section, Select, Switch } from '@/admin/ui/kit'
import { History } from '@/admin/ui/History'
import s from './sales.module.css'
import p from '@/admin/ui/panel.module.css'

type Option = { value: string; label: string }

/** قائمة من وافق متى جُلبت، وإلا حقل المعرّف نفسه — والقيمة المحفوظة تبقى ظاهرة ولو غابت عن القائمة */
function Pick({ value, onChange, options, empty }: { value: string; onChange: (v: string) => void; options: Option[] | null; empty: string }) {
  if (!options) return <Input dir="ltr" value={value} placeholder="acc_… / tax_…" onChange={(e) => onChange(e.target.value.trim())} />
  const list = [{ value: '', label: empty }, ...options, ...(value && !options.some((o) => o.value === value) ? [{ value, label: value }] : [])]
  return <Select value={value} onChange={onChange} options={list} />
}

export function WafeqSettingsForm({ initial, state, queue, failed }: {
  initial: WafeqSettings; state: WafeqState; queue: { done: number; pending: number; failed: number }
  failed: { id: string; number: string; orderId: string; error: string }[]
}) {
  const router = useRouter()
  const [v, setV] = useState(initial)
  const [saved, setSaved] = useState(JSON.stringify(initial))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [cat, setCat] = useState<WafeqCatalog | null>(null)
  const [catMsg, setCatMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const up = (fn: (o: WafeqSettings) => WafeqSettings) => { setV(fn); setMsg(null) }
  const paid = (k: keyof WafeqSettings['paidThrough'], x: string) => up((o) => ({ ...o, paidThrough: { ...o.paidThrough, [k]: x } }))

  const accounts: Option[] | null = cat ? cat.accounts.map((a) => ({ value: a.id, label: a.label })) : null
  const payAccounts: Option[] | null = cat ? cat.accounts.filter((a) => a.payment).map((a) => ({ value: a.id, label: a.label })) : null
  const taxes: Option[] | null = cat ? cat.taxRates.map((t) => ({ value: t.id, label: t.label })) : null
  const label = !state.keyed ? 'غير مربوط' : state.mock ? 'محاكاة محلية' : state.active ? 'مربوط ويعمل' : 'المفتاح مضاف — أكمل الإعداد'

  return (
    <>
      <PageHead title="وافق — الفوترة المحاسبية" sub="فاتورة وافق هي الرسمية: تُبلَّغ للهيئة منه، وتصل المتدرب مرفقة ببريد المنصة" />
      <div className={s.gateway} data-state={state.active ? 'on' : state.keyed ? 'ready' : 'off'}>
        <div>
          <span className={s.dot} aria-hidden="true" />
          <strong>وافق: {label}</strong>
          <p>{state.active ? 'كل طلب مدفوع يُنشئ فاتورته ودفعته في وافق، وكل استرداد إشعاراً دائناً.' : state.problem}</p>
          {state.mock && <p className={s.warn}>⚠︎ محاكاة لا تصل وافق — للتطوير والاختبار فقط.</p>}
        </div>
        <Switch checked={v.enabled} onChange={(b) => up((o) => ({ ...o, enabled: b }))} label={v.enabled ? 'مفعّل' : 'مقفل'} />
      </div>
      {errors.enabled && <p className={s.err}>{errors.enabled}</p>}

      <div className={s.kpis}>
        <div className={s.kpi}><strong className="num">{queue.done}</strong><span>مستند مُزامن</span></div>
        <div className={s.kpi}><strong className="num">{queue.pending}</strong><span>بانتظار المزامنة</span></div>
        <div className={s.kpi}><strong className="num">{queue.failed}</strong><span>يحتاج مراجعة</span></div>
      </div>

      {failed.length > 0 && (
        <Section title="مستندات تعذّرت مزامنتها" desc="أصلح السبب في وافق أو في الإعداد، ثم أعد المزامنة من هنا أو من صفحة الطلب">
          {failed.map((f) => <FailedRow key={f.id} {...f} />)}
        </Section>
      )}

      {!state.keyed && (
        <Section title="خطوات الربط" desc="المفتاح يُضاف في متغيّرات البيئة على الخادم، ولا يُكتب في اللوحة حفاظاً عليه">
          <ol className={s.stepsList}>
            <li>في وافق: <b>الإعدادات ← إعدادات المطوّرين ← مفاتيح API</b> أنشئ مفتاحاً وفعّل الـAPI (باقة Starter فأعلى).</li>
            <li>أضفه في Cloudflare سرّاً باسم <code dir="ltr">WAFEQ_API_KEY</code> ثم أعد النشر.</li>
            <li>عُد هنا: «جلب الحسابات من وافق»، واختر حساب الإيراد ونسبة الضريبة وحساب كل طريقة دفع، ثم فعّل.</li>
          </ol>
        </Section>
      )}

      <Section title="الحسابات" desc="من دليل حسابات وافق — الإيراد والخصومات وحساب القبض لكل طريقة دفع"
        aside={state.keyed ? <button type="button" className="btn ghost" disabled={busy} onClick={async () => {
          setBusy(true); setCatMsg('')
          const r = await wafeqCatalogAction()
          setBusy(false)
          if (r.ok) { setCat(r.catalog); setCatMsg(`متصل بـ ${r.catalog.org || 'وافق'} — ${r.catalog.accounts.length} حساباً`) } else setCatMsg(r.error)
        }}>{busy ? 'جارٍ…' : 'جلب الحسابات من وافق'}</button> : undefined}>
        {catMsg && <p className={p.muted} role="status">{catMsg}</p>}
        <Grid>
          <Field label="حساب الإيراد" error={errors.revenueAccount} hint="لأسطر الدورات والإشعارات الدائنة"><Pick value={v.revenueAccount} onChange={(x) => up((o) => ({ ...o, revenueAccount: x }))} options={accounts} empty="— اختر —" /></Field>
          <Field label="نسبة الضريبة" error={errors.taxRate} hint="ضريبة القيمة المضافة 15%"><Pick value={v.taxRate} onChange={(x) => up((o) => ({ ...o, taxRate: x }))} options={taxes} empty="— اختر —" /></Field>
          <Field label="حساب الخصومات" error={errors.discountAccount} hint="خصم المقاعد الجماعية والكوبونات (اختياري)"><Pick value={v.discountAccount} onChange={(x) => up((o) => ({ ...o, discountAccount: x }))} options={accounts} empty="الافتراضي في وافق" /></Field>
        </Grid>
        <Grid cols={3}>
          <Field label="القبض: بوابة ميسر" error={errors['paidThrough.gateway']} hint="حساب مقاصّة ميسر أو البنك"><Pick value={v.paidThrough.gateway} onChange={(x) => paid('gateway', x)} options={payAccounts} empty="لا تُسجَّل الدفعة" /></Field>
          <Field label="القبض: تحويل بنكي" error={errors['paidThrough.bank_transfer']}><Pick value={v.paidThrough.bank_transfer} onChange={(x) => paid('bank_transfer', x)} options={payAccounts} empty="لا تُسجَّل الدفعة" /></Field>
          <Field label="القبض: نقداً" error={errors['paidThrough.cash']}><Pick value={v.paidThrough.cash} onChange={(x) => paid('cash', x)} options={payAccounts} empty="لا تُسجَّل الدفعة" /></Field>
        </Grid>
      </Section>

      <Section title="المستند">
        <Switch checked={v.reportToTax} onChange={(b) => up((o) => ({ ...o, reportToTax: b }))} label="إبلاغ هيئة الزكاة والضريبة من وافق بعد الاعتماد" />
        <Grid cols={3}>
          <Field label="لغة الفاتورة"><Select value={v.language} onChange={(x) => up((o) => ({ ...o, language: x }))} options={[{ value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }]} /></Field>
        </Grid>
      </Section>

      <SaveBar dirty={JSON.stringify(v) !== saved} saving={saving} message={msg} onSave={async () => {
        setSaving(true)
        const r = await saveWafeqSettings(v)
        setSaving(false)
        if (!r.ok) { setErrors(r.errors); setMsg({ ok: false, text: r.message ?? 'تعذّر الحفظ' }); if (r.errors.enabled) setV((o) => ({ ...o, enabled: false })); return }
        setErrors({}); setSaved(JSON.stringify(v)); setMsg({ ok: true, text: v.enabled ? 'حُفظت — الربط مفعّل' : 'حُفظت' }); router.refresh()
      }} extra={<History entity="wafeq" id="settings" current={v} onRestore={(x) => { setV(x as typeof v); setMsg({ ok: true, text: 'حُمّلت النسخة — راجعها ثم احفظ' }) }} />} />
    </>
  )
}

function FailedRow({ id, number, orderId, error }: { id: string; number: string; orderId: string; error: string }) {
  return (
    <div className={s.row}>
      <span><a href={`/admin/orders/${orderId}`} className="num">{number}</a> <span className={p.muted}>{error}</span></span>
      <ResyncWafeq invoiceId={id} />
    </div>
  )
}
