'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { assignSeat, cancelPending, refundAction, resendOrderEmail } from './actions'
import { Field, Input, Switch } from '@/admin/ui/kit'
import s from './sales.module.css'

export function RefundPanel({ orderId, left }: { orderId: string; left: number }) {
  const router = useRouter()
  const [amount, setAmount] = useState(String(left / 100))
  const [reason, setReason] = useState('')
  const [cancel, setCancel] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  return (
    <section className={s.panel}>
      <h2>الاسترداد</h2>
      <Field label="المبلغ (ر.س)" hint={`المتبقي القابل للاسترداد ${(left / 100).toLocaleString('en-US')} ر.س`}><Input dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} /></Field>
      <Field label="السبب"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: اعتذار قبل الموعد بأسبوع" /></Field>
      <Switch checked={cancel} onChange={setCancel} label="إلغاء التسجيل وتحرير المقاعد" />
      {msg && <p className={s.err} style={{ margin: 0 }}>{msg}</p>}
      <button className="btn ghost" disabled={busy || !reason.trim() || !Number(amount)} onClick={async () => {
        if (!confirm(`استرداد ${amount} ر.س؟ يُنفَّذ عبر البوابة ويصدر إشعار دائن.`)) return
        setBusy(true)
        const r = await refundAction(orderId, Number(amount), reason, cancel)
        setBusy(false)
        if (!r.ok) setMsg(r.error ?? 'تعذّر الاسترداد'); else router.refresh()
      }}>{busy ? 'جارٍ…' : 'نفّذ الاسترداد'}</button>
    </section>
  )
}

export function CancelPending({ orderId }: { orderId: string }) {
  const router = useRouter()
  return <button className="btn ghost" onClick={async () => { if (confirm('إلغاء الطلب المعلّق وتحرير المقعد؟')) { await cancelPending(orderId); router.refresh() } }}>إلغاء الطلب</button>
}

/** إعادة إرسال تأكيد الطلب والفاتورة إلى بريد المشتري */
export function ResendOrder({ orderId }: { orderId: string }) {
  const [state, setState] = useState('')
  return (
    <button className="btn ghost" disabled={state === '…'} onClick={async () => {
      setState('…')
      const r = await resendOrderEmail(orderId)
      setState(r.ok ? 'أُرسل ✓' : r.error ?? 'تعذّر')
    }}>{state && state !== '…' ? state : 'إعادة إرسال التأكيد'}</button>
  )
}

export function SeatRow({ grantId }: { grantId: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <Input style={{ maxInlineSize: 170 }} placeholder="الاسم" value={name} onChange={(e) => setName(e.target.value)} />
      <Input style={{ maxInlineSize: 240 }} dir="ltr" placeholder="email@company.sa" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button className="btn ghost" style={{ minBlockSize: 42 }} disabled={!email} onClick={async () => {
        const r = await assignSeat(grantId, email, name)
        if (!r.ok) setErr(r.error ?? ''); else router.refresh()
      }}>خصّص</button>
      {err && <span className={s.err} style={{ margin: 0 }}>{err}</span>}
    </div>
  )
}
