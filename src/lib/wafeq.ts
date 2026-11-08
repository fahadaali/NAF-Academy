/* وافق (Wafeq) — الدوال النقية للربط: تحويل الفاتورة والإشعار الدائن والدفعة إلى أجسام API وافق، والمفاتيح الحتمية، والتراجع.
   الأسعار عندنا شاملة الضريبة بالهللة، فالمستند يُرسل TAX_INCLUSIVE بالريال (خانتان)، والخصومات في discount_amount لا أسطر سالبة.
   رقم المستند في وافق = رقمه في المنصة، و external_id = معرّفه — فيُعثر عليه عند إعادة المحاولة بعد انقضاء مهلة idempotency (ساعة). */

export type WafeqSettings = {
  enabled: boolean
  /** إبلاغ هيئة الزكاة (المرحلة الثانية) من وافق بعد اعتماد المستند */
  reportToTax: boolean
  /** حساب الإيراد لأسطر الفاتورة والإشعار الدائن */
  revenueAccount: string
  /** حساب الخصومات (المقاعد الجماعية والكوبونات) */
  discountAccount: string
  /** نسبة الضريبة في وافق (tax_…) */
  taxRate: string
  /** حساب القبض/الصرف لكل طريقة دفع — الفارغ لا تُسجَّل له دفعة */
  paidThrough: { gateway: string; bank_transfer: string; cash: string }
  language: 'ar' | 'en'
}

export const DEFAULT_WAFEQ: WafeqSettings = {
  enabled: false,
  reportToTax: true,
  revenueAccount: '',
  discountAccount: '',
  taxRate: '',
  paidThrough: { gateway: '', bank_transfer: '', cash: '' },
  language: 'ar',
}

/** خطوات المزامنة بالترتيب — المستند يستأنف من خطوته المحفوظة */
export const WAFEQ_STEPS = ['contact', 'document', 'report', 'payment', 'pdf', 'done'] as const
export type WafeqStep = (typeof WAFEQ_STEPS)[number]
export const WAFEQ_STATUS = ['off', 'pending', 'running', 'done', 'failed'] as const
export type WafeqStatus = (typeof WAFEQ_STATUS)[number]

/** التراجع بين المحاولات (دقائق) — بعد آخرها يُوسم المستند «فشل» ويُنبَّه الفريق */
export const WAFEQ_BACKOFF_MIN = [5, 15, 60, 180, 720] as const
/** أقصى انتظار لبريد «تم الدفع» حتى تصل فاتورة وافق، ثم يُرسل بالفاتورة المحلية (دقائق) */
export const WAFEQ_MAIL_WAIT_MIN = 30

export function nextAttemptAt(attempts: number, now: Date): string | null {
  const m = WAFEQ_BACKOFF_MIN[attempts]
  return m === undefined ? null : new Date(now.getTime() + m * 60e3).toISOString()
}

/** الهللة ← ريال بخانتين */
export const riyal = (halalas: number) => Math.round(halalas) / 100

/** تاريخ اليوم بتوقيت الرياض (YYYY-MM-DD) — تاريخ المستند في وافق */
export function riyadhDate(iso: string): string {
  return new Date(Date.parse(iso) + 3 * 3600e3).toISOString().slice(0, 10)
}

type Line = { title: string; quantity: number; unit: number; total: number }
type Doc = { id: string; number: string; kind: 'invoice' | 'credit_note'; lines: Line[]; total: number; issuedAt: string }
export type Buyer = { name: string; email: string; phone?: string; org: string; vatNumber: string }

/** ما الذي ينقص الإعداد قبل المزامنة — فارغ = جاهز */
export function missingSettings(c: WafeqSettings): string[] {
  const out: string[] = []
  if (!c.revenueAccount) out.push('حساب الإيراد')
  if (!c.taxRate) out.push('نسبة الضريبة')
  return out
}

/** جهة الاتصال: المنشأة برقمها الضريبي، وإلا الفرد ببريده — المفتاح الخارجي يمنع تكرارها */
export function contactKey(b: Buyer): string {
  return b.vatNumber ? `vat:${b.vatNumber}` : `email:${b.email.trim().toLowerCase()}`
}

export function contactBody(b: Buyer) {
  const business = !!b.vatNumber
  return {
    name: (business && b.org.trim() ? b.org : b.name).trim().slice(0, 200),
    email: b.email.trim().toLowerCase(),
    ...(b.phone ? { phone: b.phone } : {}),
    country: 'SA',
    party_type: business ? 'business' : 'individual',
    ...(business ? { tax_registration_number: b.vatNumber } : {}),
    is_customer: true,
    external_id: contactKey(b),
  }
}

function lineItems(lines: Line[], c: WafeqSettings) {
  return lines.filter((l) => l.total >= 0).map((l, i) => ({
    account: c.revenueAccount,
    description: l.title.replace(/~\d?/g, '').slice(0, 500),
    quantity: l.quantity,
    unit_amount: riyal(l.unit),
    tax_rate: c.taxRate,
    order: i + 1,
  }))
}

/** الفاتورة تُنشأ مسودة أولاً، فيُطابق إجماليها قبل اعتمادها — لا تُعتمد فاتورة بمبلغ يخالف الطلب */
export function invoiceBody(inv: Doc, c: WafeqSettings, contact: string, orderNumber: string) {
  const discount = -inv.lines.filter((l) => l.total < 0).reduce((n, l) => n + l.total, 0)
  const date = riyadhDate(inv.issuedAt)
  return {
    contact,
    currency: 'SAR',
    invoice_number: inv.number,
    invoice_date: date,
    invoice_due_date: date,
    tax_amount_type: 'TAX_INCLUSIVE',
    language: c.language,
    status: 'DRAFT',
    reference: orderNumber,
    external_id: inv.id,
    line_items: lineItems(inv.lines, c),
    ...(discount > 0 ? { discount_amount: riyal(discount), discount_tax_rate: c.taxRate, ...(c.discountAccount ? { discount_account: c.discountAccount } : {}) } : {}),
  }
}

/** الإشعار الدائن يشير إلى رقم الفاتورة الأصلية في reference */
export function creditNoteBody(cn: Doc, c: WafeqSettings, contact: string, invoiceNumber: string) {
  return {
    contact,
    currency: 'SAR',
    credit_note_number: cn.number,
    credit_note_date: riyadhDate(cn.issuedAt),
    tax_amount_type: 'TAX_INCLUSIVE',
    language: c.language,
    status: 'DRAFT',
    reference: invoiceNumber,
    external_id: cn.id,
    line_items: lineItems(cn.lines, c),
  }
}

/** الدفعة: قبض على الفاتورة، أو صرف (استرداد) على الإشعار الدائن */
export function paymentBody(p: { kind: 'invoice' | 'credit_note'; docId: string; amount: number; date: string; account: string; contact: string; reference: string; externalId: string }) {
  const amount = riyal(p.amount)
  const link = { amount, amount_to_pcy: amount }
  return {
    amount,
    currency: 'SAR',
    date: riyadhDate(p.date),
    paid_through_account: p.account,
    contact: p.contact,
    reference: p.reference,
    external_id: p.externalId,
    ...(p.kind === 'invoice' ? { invoice_payments: [{ ...link, invoice: p.docId }] } : { credit_note_payments: [{ ...link, credit_note: p.docId }] }),
  }
}

/** إجمالي وافق (شامل الضريبة) يطابق إجمالينا بالهللة */
export const amountMatches = (wafeqAmount: unknown, halalas: number) => typeof wafeqAmount === 'number' && Math.round(wafeqAmount * 100) === halalas

/** نص خطأ مقروء من استجابة وافق (أشكال DRF: detail / message / حقول بقوائم) */
export function wafeqError(status: number, body: unknown): string {
  const flat = (v: unknown, path = ''): string[] => {
    if (v == null) return []
    if (typeof v === 'string') return [path ? `${path}: ${v}` : v]
    if (Array.isArray(v)) return v.flatMap((x) => flat(x, path))
    if (typeof v === 'object') return Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => flat(x, ['detail', 'message', 'non_field_errors', 'errors'].includes(k) ? path : path ? `${path}.${k}` : k))
    return [String(v)]
  }
  const msg = flat(body).join(' · ').slice(0, 300)
  return `وافق ${status}${msg ? `: ${msg}` : ''}`
}
