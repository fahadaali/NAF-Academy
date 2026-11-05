'use client'
/* صفحة الدفع — الباقة والعدد، والكوبون الحي، وبيانات المشتري، وملخص ثابت بأرقام تتدحرج. */
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PublicTier } from '@/server/queries'
import { placeOrderAction, quoteAction, type QuoteView } from '@/site/actions'
import { formatAmount } from '@/lib/pricing'
import { ease, prefersCalm, timing } from '@/motion/tokens'
import { Riyal } from '@/components/Riyal'
import { CodeLogin, type Verified } from '@/site/auth/CodeLogin'
import s from './checkout.module.css'
import { PAY_METHOD_LABEL, type PayMethod } from '@/lib/enums'

function useTween(target: number) {
  const [v, setV] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    if (prefersCalm()) { setV(target); from.current = target; return }
    const a = from.current
    const t0 = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const k = ease.glide(Math.min(1, (t - t0) / timing.reveal))
      const x = Math.round(a + (target - a) * k)
      setV(x)
      from.current = x
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return v
}

const Money = ({ v, className = '' }: { v: number; className?: string }) => {
  const x = useTween(v)
  return <span className={`num ${className}`}>{formatAmount(x)} <Riyal /></span>
}

type Props = {
  slug: string
  title: string
  tiers: PublicTier[]
  groupRules: { minQty: number; percent: number }[]
  maxQty: number
  initial: QuoteView
  initialCode: string
  salesOpen: boolean
  terms: string
  refundPolicy: string
  learner: Verified | null
  channels: ('email' | 'sms')[]
  /** الوسائل المفعّلة في إعدادات الدفع */
  methods: PayMethod[]
}

export function Checkout({ slug, title, tiers, groupRules, maxQty, initial, initialCode, salesOpen, terms, refundPolicy, learner, channels, methods }: Props) {
  const router = useRouter()
  const [tierId, setTierId] = useState<string | null>(initial.tierId)
  const [qty, setQty] = useState(1)
  const [code, setCode] = useState(initialCode)
  const [applied, setApplied] = useState(initialCode)
  const [q, setQ] = useState<QuoteView>(initial)
  const [me, setMe] = useState<Verified | null>(learner)
  /* اسم الحساب الافتراضي (ما قبل @) ليس اسماً — يُطلب الاسم الحقيقي لأنه يُطبع على الشهادة والفاتورة */
  const realName = (l: Verified) => (!l.name || l.name.includes('@') || l.name === l.email.split('@')[0] ? '' : l.name)
  const [b, setB] = useState(learner ? { ...learner, name: realName(learner) } : { name: '', email: '', phone: '', org: '', vatNumber: '' })
  const [business, setBusiness] = useState(!!learner?.vatNumber)
  const mustVerify = channels.length > 0 && !me
  const [attendSelf, setAttendSelf] = useState(true)
  const [agree, setAgree] = useState(false)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)

  /* إعادة التسعير من الخادم عند كل تغيير مؤثّر */
  useEffect(() => {
    const id = ++seq.current
    const t = setTimeout(async () => {
      const r = await quoteAction(slug, { tierId, quantity: qty, code: applied || undefined, email: b.email || undefined })
      if (r && id === seq.current) setQ(r)
    }, 160)
    return () => clearTimeout(t)
  }, [slug, tierId, qty, applied, b.email])

  const free = q.total === 0
  const canPay = free || salesOpen
  const set = (k: keyof typeof b, v: string) => { setB((o) => ({ ...o, [k]: v })); setFields((f) => ({ ...f, [`buyer.${k}`]: '' })) }
  const nextRule = groupRules.find((r) => r.minQty > qty)

  const submit = async () => {
    setBusy(true)
    setError('')
    const r = await placeOrderAction(slug, { tierId, quantity: qty, code: q.couponApplied ? applied : '', attendSelf, agree, buyer: { ...b, vatNumber: business ? b.vatNumber : '', org: b.org } })
    if (r.ok) { router.push(r.url); return }
    setBusy(false)
    setError(r.error)
    setFields(r.fields ?? {})
  }

  return (
    <div className={s.grid}>
      <div className={s.steps}>
        {tiers.length > 0 && (
          <section className={s.step}>
            <h2><span className="num">1</span> اختر الباقة</h2>
            <div className={s.tiers} role="radiogroup">
              {tiers.map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={tierId === t.id} className={s.tier} data-highlight={t.highlight ? '1' : '0'} onClick={() => setTierId(t.id)}>
                  {t.highlight && <span className={s.flag}>الأكثر اختياراً</span>}
                  <strong>{t.name}</strong>
                  <span className={`num ${s.tierPrice}`}>{formatAmount(t.price)} <Riyal />{t.compareAt ? <s>{formatAmount(t.compareAt)}</s> : null}</span>
                  {t.description && <span className={s.tierDesc}>{t.description}</span>}
                  {t.features.length > 0 && <ul role="list">{t.features.map((f) => <li key={f}>{f}</li>)}</ul>}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className={s.step}>
          <h2><span className="num">{tiers.length ? 2 : 1}</span> عدد المقاعد</h2>
          <div className={s.qtyRow}>
            <div className={s.stepper}>
              <button type="button" aria-label="أقل" disabled={qty <= 1} onClick={() => setQty((x) => Math.max(1, x - 1))}>−</button>
              <output className="num" aria-live="polite">{qty}</output>
              <button type="button" aria-label="أكثر" disabled={qty >= maxQty} onClick={() => setQty((x) => Math.min(maxQty, x + 1))}>+</button>
            </div>
            <span className={s.hint}>
              {q.groupPercent > 0 ? <>خصم المجموعة <strong className="num">{q.groupPercent}%</strong> مطبّق</> : nextRule ? <>سجّل <span className="num">{nextRule.minQty}</span> مقاعد فأكثر لخصم <span className="num">{nextRule.percent}%</span></> : 'لفريقك؟ زد العدد وخصّص المقاعد لاحقاً'}
            </span>
          </div>
          {qty > 1 && (
            <label className={s.check}><input type="checkbox" checked={attendSelf} onChange={(e) => setAttendSelf(e.target.checked)} /> سأحضر بنفسي (أحد المقاعد لي)</label>
          )}
        </section>

        <section className={s.step}>
          <h2><span className="num">{tiers.length ? 3 : 2}</span> كوبون الخصم</h2>
          <div className={s.couponRow}>
            <input className={s.input} dir="ltr" placeholder="NAF20" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && setApplied(code.trim())} aria-label="رمز الكوبون" />
            {q.couponApplied ? (
              <button type="button" className="btn ghost" onClick={() => { setApplied(''); setCode('') }}>إزالة</button>
            ) : (
              <button type="button" className="btn ghost" disabled={!code.trim()} onClick={() => setApplied(code.trim())}>تطبيق</button>
            )}
          </div>
          {applied && (q.couponApplied
            ? <p className={s.ok} role="status">✓ الكوبون {q.couponCode} مطبّق{q.couponLabel ? ` — ${q.couponLabel}` : ''}</p>
            : q.couponError ? <p className={s.err} role="alert">{q.couponError}</p> : null)}
        </section>

        <section className={s.step}>
          <h2><span className="num">{tiers.length ? 4 : 3}</span> بياناتك</h2>
          {mustVerify ? (
            <>
              <p className={s.hint}>تحقّق من بريدك برمز يصلك فوراً — يصير هو حسابك، وتجد فيه دوراتك وفواتيرك.</p>
              <CodeLogin compact channels={channels} onDone={(l) => { setMe(l); setB({ ...l, name: realName(l) }); setBusiness(!!l.vatNumber) }} />
            </>
          ) : (
          <>
          {me && <p className={s.ok}>✓ تم التحقق: <span dir="ltr">{me.email}</span></p>}
          <div className={s.fields}>
            <Field label="الاسم الكامل" err={fields['buyer.name']}><input className={s.input} autoComplete="name" value={b.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="البريد الإلكتروني" err={fields['buyer.email']} hint="تصلك عليه الفاتورة وتفاصيل الدخول"><input className={s.input} dir="ltr" type="email" autoComplete="email" value={b.email} disabled={!!me} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="الجوال" err={fields['buyer.phone']}><input className={s.input} dir="ltr" type="tel" autoComplete="tel" placeholder="05xxxxxxxx" value={b.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="الجهة (اختياري)"><input className={s.input} autoComplete="organization" value={b.org} onChange={(e) => set('org', e.target.value)} /></Field>
          </div>
          <label className={s.check}><input type="checkbox" checked={business} onChange={(e) => setBusiness(e.target.checked)} /> أريد فاتورة ضريبية باسم منشأة</label>
          {business && (
            <Field label="الرقم الضريبي للمنشأة" err={fields['buyer.vatNumber']}><input className={s.input} dir="ltr" inputMode="numeric" maxLength={15} value={b.vatNumber} onChange={(e) => set('vatNumber', e.target.value.replace(/\D/g, ''))} /></Field>
          )}
          </>
          )}
        </section>
      </div>

      <aside className={s.summary}>
        <div className={s.card}>
          <h2 className={s.sumTitle}>{title}</h2>
          <dl className={s.lines}>
            <div><dt>{q.quantity > 1 ? <>سعر المقعد × <span className="num">{q.quantity}</span></> : 'سعر الدورة'}</dt>
              <dd>{q.saleActive && <s className="num">{formatAmount(q.unitList * q.quantity)}</s>}<Money v={q.subtotal} /></dd></div>
            {q.groupDiscount > 0 && <div className={s.minus}><dt>خصم المجموعة <span className="num">{q.groupPercent}%</span></dt><dd><bdi dir="ltr">−<Money v={q.groupDiscount} /></bdi></dd></div>}
            {q.couponDiscount > 0 && <div className={s.minus}><dt>الكوبون {q.couponCode}</dt><dd><bdi dir="ltr">−<Money v={q.couponDiscount} /></bdi></dd></div>}
          </dl>
          <div className={s.total}>
            <span>الإجمالي</span>
            {free ? <strong>مجاناً</strong> : <Money v={q.total} className={s.totalNum} />}
          </div>
          {!free && <p className={`num ${s.vat}`}>شامل ضريبة القيمة المضافة ({formatAmount(q.vat)} ر.س)</p>}

          <label className={s.check} data-err={fields.agree ? '1' : '0'}>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>{terms} <details className={s.policy}><summary>سياسة الاسترداد</summary>{refundPolicy}</details></span>
          </label>

          {error && <p className={s.err} role="alert">{error}</p>}
          {canPay ? (
            <button type="button" className={`btn ${s.pay}`} disabled={busy || mustVerify} onClick={submit}>
              {busy ? 'لحظة…' : free ? 'أكّد التسجيل' : 'تابع للدفع الآمن'}
            </button>
          ) : (
            <div className={s.locked} role="status">
              <strong>الدفع الإلكتروني يُفتح قريباً</strong>
              <span>سجّل اهتمامك أدناه ونبلغك فور فتح التسجيل.</span>
            </div>
          )}
          {canPay && !free && methods.length > 0 && <p className={s.secure}>🔒 الدفع عبر ميسر — {methods.map((m) => PAY_METHOD_LABEL[m]).join('، ')}. لا نحفظ بيانات بطاقتك.</p>}
        </div>
      </aside>
    </div>
  )
}

function Field({ label, err, hint, children }: { label: string; err?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className={s.field} data-err={err ? '1' : '0'}>
      <span>{label}</span>
      {children}
      {err ? <em className={s.err}>{err}</em> : hint ? <em className={s.hint}>{hint}</em> : null}
    </label>
  )
}
