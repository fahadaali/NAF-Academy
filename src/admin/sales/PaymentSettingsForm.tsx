'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PaymentSettings } from '@/server/settings'
import type { GatewayStatus } from '@/server/payments/gateway'
import { savePaymentSettings } from './actions'
import { Field, Grid, Input, PageHead, SaveBar, Section, Switch, Textarea } from '@/admin/ui/kit'
import s from './sales.module.css'
import p from '@/admin/ui/panel.module.css'
import { PAY_METHOD_LABEL } from '@/lib/enums'
import { History } from '@/admin/ui/History'

export type Verify = { code: string; at: string; signed: boolean }
export type WebhookHit = { at: string; type: string; keys: string[]; code: string | null; signed: boolean; result: string }

const time = (iso: string) => new Intl.DateTimeFormat('ar-SA-u-nu-latn', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Riyadh' }).format(new Date(iso))

/** رمز تحقق ميسر وما وصل منها — ظاهر دائماً، حتى يُعرف إن لم يصل شيء */
function WebhookBox({ verification, hits }: { verification?: Verify | null; hits: WebhookHit[] }) {
  return (
    <div className={s.verify} role="status">
      <strong>إشعارات ميسر (Webhook)</strong>
      {verification ? (
        <>
          <p>رمز التحقق — أدخله في لوحة ميسر في «التحقق من الإشعار». وصل {time(verification.at)}، وصالح 30 دقيقة.</p>
          <code className={`${s.code} num`} dir="ltr">{verification.code}</code>
          {!verification.signed && <p className={s.warn}>لم يصل معه السرّ المطابق: تأكد أن «Secret Token» في ميسر هو نفسه MOYASAR_WEBHOOK_SECRET في Cloudflare، وإلا رُفضت إشعارات الدفع.</p>}
        </>
      ) : (
        <p>لا رمز تحقق حالياً. في لوحة ميسر اضغط «إعادة إرسال الرمز»، ثم حدّث هذه الصفحة بعد ثوانٍ.</p>
      )}
      {hits.length > 0 ? (
        <div className={s.hits}>
          <span>آخر ما وصل من ميسر:</span>
          <ul>
            {hits.map((h, i) => (
              <li key={i}><span className="num" dir="ltr">{time(h.at)}</span> — {h.result}{h.type ? <> · <code dir="ltr">{h.type}</code></> : null}{h.keys.length ? <> · الحقول: <code dir="ltr">{h.keys.join(', ')}</code></> : null}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className={s.warn}>لم يصل أي طلب من ميسر إلى المنصة بعد. تأكد أن الرابط في ميسر هو <code dir="ltr">/api/payments/webhook</code> على نطاق المنصة، وأن حماية Cloudflare (Bot Fight Mode) لا تحجبه.</p>
      )}
    </div>
  )
}

const METHOD: Record<PaymentSettings['methods'][number], string> = PAY_METHOD_LABEL

export function PaymentSettingsForm({ initial, status, verification, hits = [] }: { initial: PaymentSettings; status: GatewayStatus; verification?: Verify | null; hits?: WebhookHit[] }) {
  const router = useRouter()
  const [v, setV] = useState(initial)
  const [saved, setSaved] = useState(JSON.stringify(initial))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const up = (fn: (o: PaymentSettings) => PaymentSettings) => { setV(fn); setMsg(null) }
  const seller = (k: keyof PaymentSettings['seller'], x: string) => up((o) => ({ ...o, seller: { ...o.seller, [k]: x } }))
  const label = status.mode === 'live' ? 'مربوط — إنتاج' : status.mode === 'test' ? 'مربوط — وضع الاختبار' : status.mode === 'mock' ? 'بوابة تجريبية محلية' : 'غير مربوط'

  return (
    <>
      <PageHead title="إعدادات الدفع" sub="الدفع الإلكتروني مبني بالكامل، ويعمل فور الربط والتفعيل" />
      <div className={s.gateway} data-state={status.configured ? (v.enabled ? 'on' : 'ready') : 'off'}>
        <div>
          <span className={s.dot} aria-hidden="true" />
          <strong>بوابة ميسر: {label}</strong>
          <p>{status.configured ? (v.enabled ? 'الدفع الإلكتروني مفعّل ويستقبل الطلبات.' : 'البوابة جاهزة — فعّل الدفع ليظهر للمتدربين.') : status.problem}</p>
          {status.mode === 'mock' && <p className={s.warn}>⚠︎ بوابة تجريبية لا تأخذ مالاً — لا تُستخدم إلا محلياً.</p>}
        </div>
        <Switch checked={v.enabled} onChange={(b) => up((o) => ({ ...o, enabled: b }))} label={v.enabled ? 'مفعّل' : 'مقفل'} />
      </div>
      {errors.enabled && <p className={s.err}>{errors.enabled}</p>}

      <WebhookBox verification={verification} hits={hits} />

      {!status.configured && (
        <Section title="خطوات الربط" desc="تُضاف في متغيّرات البيئة على الخادم، ولا تُكتب في اللوحة حفاظاً عليها">
          <ol className={s.stepsList}>
            <li>من لوحة ميسر: <b>Settings ← API Keys</b> انسخ المفتاحين العام والسري.</li>
            <li>أضفها في البيئة: <code dir="ltr">MOYASAR_PUBLISHABLE_KEY</code> و<code dir="ltr">MOYASAR_SECRET_KEY</code>.</li>
            <li>من <b>Webhooks</b> أنشئ رابطاً إلى <code dir="ltr">/api/payments/webhook</code> بالأحداث <code dir="ltr">payment_paid</code> و<code dir="ltr">payment_failed</code>، وضع سرّه في <code dir="ltr">MOYASAR_WEBHOOK_SECRET</code>.</li>
            <li>لـApple Pay: وثّق النطاق من لوحة ميسر.</li>
            <li>أعد النشر، ثم عُد هنا وفعّل.</li>
          </ol>
        </Section>
      )}

      <Section title="وسائل الدفع والحجز">
        <div className={p.options}>
          {(Object.keys(METHOD) as PaymentSettings['methods']).map((m) => (
            <Switch key={m} checked={v.methods.includes(m)} onChange={(b) => up((o) => ({ ...o, methods: b ? [...o.methods, m] : o.methods.filter((x) => x !== m) }))} label={METHOD[m]} />
          ))}
        </div>
        {errors.methods && <p className={s.err}>{errors.methods}</p>}
        <Grid cols={3}>
          <Field label="مهلة حجز المقعد (دقيقة)" hint="المقعد محجوز للمشتري حتى يدفع"><Input type="number" dir="ltr" min={10} max={120} value={v.holdMinutes} onChange={(e) => up((o) => ({ ...o, holdMinutes: Number(e.target.value) }))} /></Field>
          <Field label="ضريبة القيمة المضافة %" hint="الأسعار شاملة الضريبة"><Input type="number" dir="ltr" value={v.vatRate} onChange={(e) => up((o) => ({ ...o, vatRate: Number(e.target.value) }))} /></Field>
          <Field label="بادئة الطلبات / الفواتير" error={errors.orderPrefix || errors.invoicePrefix}>
            <div className={p.pair}>
              <Input dir="ltr" value={v.orderPrefix} onChange={(e) => up((o) => ({ ...o, orderPrefix: e.target.value.toUpperCase() }))} />
              <Input dir="ltr" value={v.invoicePrefix} onChange={(e) => up((o) => ({ ...o, invoicePrefix: e.target.value.toUpperCase() }))} />
            </div>
          </Field>
        </Grid>
      </Section>

      <Section title="بيانات المنشأة على الفاتورة" desc="تظهر في الفاتورة الضريبية المبسّطة ورمز QR">
        <Grid>
          <Field label="الاسم النظامي" error={errors['seller.name']}><Input value={v.seller.name} onChange={(e) => seller('name', e.target.value)} /></Field>
          <Field label="الرقم الضريبي" error={errors['seller.vatNumber']} hint="15 رقماً"><Input dir="ltr" inputMode="numeric" maxLength={15} value={v.seller.vatNumber} onChange={(e) => seller('vatNumber', e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="السجل التجاري"><Input dir="ltr" value={v.seller.crNumber} onChange={(e) => seller('crNumber', e.target.value)} /></Field>
          <Field label="العنوان"><Input value={v.seller.address} onChange={(e) => seller('address', e.target.value)} /></Field>
        </Grid>
      </Section>

      <Section title="الشروط وسياسة الاسترداد" desc="تظهر في صفحة الدفع، ويوافق عليها المشتري">
        <Field label="نص الموافقة"><Textarea rows={2} value={v.terms} onChange={(e) => up((o) => ({ ...o, terms: e.target.value }))} /></Field>
        <Field label="سياسة الاسترداد"><Textarea rows={4} value={v.refundPolicy} onChange={(e) => up((o) => ({ ...o, refundPolicy: e.target.value }))} /></Field>
      </Section>

      <SaveBar dirty={JSON.stringify(v) !== saved} saving={saving} message={msg} onSave={async () => {
        setSaving(true)
        const r = await savePaymentSettings(v)
        setSaving(false)
        if (!r.ok) { setErrors(r.errors); setMsg({ ok: false, text: r.message ?? 'تعذّر الحفظ' }); if (r.errors.enabled) setV((o) => ({ ...o, enabled: false })); return }
        setErrors({}); setSaved(JSON.stringify(v)); setMsg({ ok: true, text: v.enabled ? 'حُفظت — الدفع مفعّل' : 'حُفظت' }); router.refresh()
      }} extra={<History entity="payments" id="settings" current={v} onRestore={(x) => { setV(x as typeof v); setMsg({ ok: true, text: 'حُمّلت النسخة — راجعها ثم احفظ' }) }} />} />
    </>
  )
}
