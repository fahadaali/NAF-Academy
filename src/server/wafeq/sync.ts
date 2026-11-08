import 'server-only'
/* مزامنة الفواتير والإشعارات الدائنة مع وافق — آلة خطوات تستأنف من خطوتها المحفوظة (wafeqStep):
   جهة الاتصال ← المستند (مسودة ← مطابقة الإجمالي ← اعتماد) ← الإبلاغ للهيئة ← الدفعة (قبض للفاتورة، صرف للاسترداد) ← PDF ← تم.
   فاتورة وافق هي الرسمية متى اكتملت؛ والمحلية احتياط. الفشل لا يوقف الإتمام ولا الاسترداد: يُعاد بالتراجع من المشغّل الدوري،
   وبعد آخر محاولة (أو خطأ لا يُصلحه التكرار) يُوسم «فشل» ويُنبَّه الفريق في السجل. */
import { and, desc, eq, inArray, isNull, lte, or } from 'drizzle-orm'
import { db, schema as s } from '../db'
import { audit } from '../audit'
import { putObject } from '../storage'
import { contactBody, contactKey, creditNoteBody, invoiceBody, nextAttemptAt, amountMatches, paymentBody, type WafeqSettings } from '@/lib/wafeq'
import { findByExternal, wafeqJson, wafeqPdf, wafeqSettings, wafeqState, WafeqError } from './client'

type Invoice = typeof s.invoices.$inferSelect
type Order = typeof s.orders.$inferSelect

const nowIso = () => new Date().toISOString()
/** مطالبة التشغيل تنتهي بعد عشر دقائق إن انقطع (تعود للطابور) */
const STALE_MS = 10 * 60e3
export const wafeqPdfKey = (invoiceId: string) => `wafeq-${invoiceId}.pdf`

class Permanent extends Error {}

/** يضع المستند في طابور المزامنة إن كان الربط فعّالاً (يُستدعى بعد إصداره محلياً) */
export async function queueWafeq(invoiceId: string): Promise<boolean> {
  if (!wafeqState(await wafeqSettings()).active) return false
  await db.update(s.invoices).set({ wafeqStatus: 'pending', wafeqNextAt: nowIso(), wafeqError: '' })
    .where(and(eq(s.invoices.id, invoiceId), eq(s.invoices.wafeqStatus, 'off')))
  return true
}

/** يضع المستند في الطابور ثم يزامنه فوراً — فشله لا يرمي */
export async function syncNow(invoiceId: string): Promise<void> {
  try {
    if (await queueWafeq(invoiceId)) await syncInvoice(invoiceId)
  } catch (e) {
    console.error('wafeq sync', (e as Error).message)
  }
}

/** مزامنة مستند واحد: مطالبة ذرّية ثم الخطوات المتبقية */
export async function syncInvoice(invoiceId: string, opts: { force?: boolean } = {}): Promise<Invoice['wafeqStatus']> {
  const cfg = await wafeqSettings()
  if (!wafeqState(cfg).active) return 'off'
  const stale = new Date(Date.now() - STALE_MS).toISOString()
  const [inv] = await db.update(s.invoices).set({ wafeqStatus: 'running', wafeqAt: nowIso() })
    .where(and(eq(s.invoices.id, invoiceId),
      or(eq(s.invoices.wafeqStatus, 'pending'), and(eq(s.invoices.wafeqStatus, 'running'), lte(s.invoices.wafeqAt, stale)),
        opts.force ? inArray(s.invoices.wafeqStatus, ['failed', 'off']) : undefined)))
    .returning()
  if (!inv) return (await db.select({ st: s.invoices.wafeqStatus }).from(s.invoices).where(eq(s.invoices.id, invoiceId)))[0]?.st ?? 'off'
  const [order] = await db.select().from(s.orders).where(eq(s.orders.id, inv.orderId))
  let cur = inv
  const save = async (patch: Partial<Invoice>) => {
    await db.update(s.invoices).set({ ...patch, wafeqAt: nowIso() }).where(eq(s.invoices.id, inv.id))
    cur = { ...cur, ...patch }
  }
  try {
    if (!order) throw new Permanent('الطلب غير موجود')
    while (cur.wafeqStep !== 'done') await step(cur, order, cfg, save)
    await save({ wafeqStatus: 'done', wafeqError: '', wafeqNextAt: null })
    await audit('system', 'wafeq_synced', 'order', order.id, `${cur.number} ← وافق ${cur.wafeqNumber ?? cur.wafeqId}${cur.wafeqTax ? ` · الهيئة: ${cur.wafeqTax}` : ''}`)
    return 'done'
  } catch (e) {
    const err = e as Error
    const transient = !(e instanceof Permanent) && (!(e instanceof WafeqError) || e.transient)
    const attempts = cur.wafeqAttempts + 1
    const next = transient ? nextAttemptAt(cur.wafeqAttempts, new Date()) : null
    await save({ wafeqStatus: next ? 'pending' : 'failed', wafeqError: err.message.slice(0, 400), wafeqAttempts: attempts, wafeqNextAt: next })
    if (!next) await audit('system', 'needs_attention', 'order', inv.orderId, `${inv.number}: تعذّرت مزامنته مع وافق (${cur.wafeqStep}) — ${err.message.slice(0, 200)}`)
    return next ? 'pending' : 'failed'
  }
}

async function step(inv: Invoice, order: Order, cfg: WafeqSettings, save: (p: Partial<Invoice>) => Promise<void>) {
  const isInv = inv.kind === 'invoice'
  const coll = isInv ? 'invoices' : 'credit-notes'
  switch (inv.wafeqStep) {
    case 'contact': {
      if (!isInv) {
        /* الإشعار الدائن يتبع فاتورته: جهتها نفسها، وينتظر حتى تُعتمد في وافق */
        const parent = await parentOf(inv)
        if (!parent?.wafeqId || !parent.wafeqContactId) throw new Error('بانتظار مزامنة الفاتورة الأصلية')
        return save({ wafeqContactId: parent.wafeqContactId, wafeqStep: 'document' })
      }
      const buyer = { ...inv.buyer, phone: order.buyer.phone }
      const found = await findByExternal('contacts', contactKey(buyer))
      const id = found?.id ?? (await wafeqJson<{ id: string }>('POST', '/contacts/', contactBody(buyer), `contact:${contactKey(buyer)}`)).id
      return save({ wafeqContactId: id, wafeqStep: 'document' })
    }
    case 'document': {
      type Doc = { id: string; amount?: number; status?: string; invoice_number?: string; credit_note_number?: string }
      let doc: Doc | null = await findByExternal<Doc>(coll, inv.id)
      if (!doc) {
        const body = isInv ? invoiceBody(inv, cfg, inv.wafeqContactId!, order.number) : creditNoteBody(inv, cfg, inv.wafeqContactId!, (await parentOf(inv))?.wafeqNumber ?? inv.refOf ?? '')
        doc = await wafeqJson<Doc>('POST', `/${coll}/`, body, `${coll}:${inv.id}`)
      }
      if (doc.status !== 'FINALIZED') {
        /* لا تُعتمد وثيقة ضريبية بإجمالي يخالف الطلب — تبقى مسودة في وافق للمراجعة */
        if (!amountMatches(doc.amount, inv.total)) throw new Permanent(`إجمالي وافق (${doc.amount}) لا يطابق ${(inv.total / 100).toFixed(2)} — المسودة ${doc.id} بانتظار المراجعة`)
        doc = await wafeqJson<Doc>('PATCH', `/${coll}/${doc.id}/`, { status: 'FINALIZED' }, `${coll}:${inv.id}:finalize`)
      }
      return save({ wafeqId: doc.id, wafeqNumber: doc.invoice_number ?? doc.credit_note_number ?? inv.number, wafeqStep: 'report' })
    }
    case 'report': {
      if (cfg.reportToTax) {
        try {
          const r = await wafeqJson<{ status?: string }>('POST', `/${coll}/${inv.wafeqId}/tax-authority/report/`, {}, `${coll}:${inv.id}:report`)
          await save({ wafeqTax: r.status ?? 'PENDING' })
        } catch (e) {
          /* إبلاغ جارٍ من محاولة سابقة: يكفي — الحالة النهائية تُقرأ من وافق */
          if (!(e instanceof WafeqError && e.status === 409)) throw e
          await save({ wafeqTax: 'PENDING' })
        }
      }
      return save({ wafeqStep: 'payment' })
    }
    case 'payment': {
      const account = cfg.paidThrough[order.method as keyof WafeqSettings['paidThrough']] ?? ''
      /* الاسترداد اليدوي أو طريقة بلا حساب: يبقى المستند ويُسجَّل القبض/الصرف يدوياً في وافق */
      if (account) {
        const ext = `pay:${inv.id}`
        const found = await findByExternal('payments', ext)
        const pay = found ?? await wafeqJson<{ id: string }>('POST', '/payments/', paymentBody({
          kind: inv.kind, docId: inv.wafeqId!, amount: inv.total, date: isInv ? order.paidAt ?? inv.issuedAt : inv.issuedAt,
          account, contact: inv.wafeqContactId!, reference: isInv ? (order.gatewayPaymentId ?? order.number) : `${order.number} · ${inv.number}`, externalId: ext,
        }), ext)
        await save({ wafeqPaymentId: pay.id })
      }
      return save({ wafeqStep: 'pdf' })
    }
    case 'pdf': {
      const bytes = await wafeqPdf(`/${coll}/${inv.wafeqId}/download/`)
      await putObject(wafeqPdfKey(inv.id), bytes, 'application/pdf')
      return save({ wafeqStep: 'done' })
    }
  }
}

async function parentOf(cn: Invoice) {
  const [p] = await db.select().from(s.invoices).where(and(eq(s.invoices.orderId, cn.orderId), eq(s.invoices.kind, 'invoice')))
  return p ?? null
}

/** المشغّل الدوري: المستحق من الطابور (الفواتير قبل إشعاراتها) */
export async function retryWafeq(now = new Date(), limit = 20): Promise<{ done: number; pending: number; failed: number }> {
  const out = { done: 0, pending: 0, failed: 0 }
  if (!wafeqState(await wafeqSettings()).active) return out
  const stale = new Date(now.getTime() - STALE_MS).toISOString()
  const due = await db.select({ id: s.invoices.id }).from(s.invoices)
    .where(or(and(eq(s.invoices.wafeqStatus, 'pending'), or(isNull(s.invoices.wafeqNextAt), lte(s.invoices.wafeqNextAt, now.toISOString()))),
      and(eq(s.invoices.wafeqStatus, 'running'), lte(s.invoices.wafeqAt, stale))))
    .orderBy(desc(s.invoices.kind), s.invoices.issuedAt) /* invoice قبل credit_note */.limit(limit)
  for (const d of due) {
    const r = await syncInvoice(d.id)
    if (r === 'done') out.done++; else if (r === 'failed') out.failed++; else out.pending++
  }
  return out
}

/** إعادة المزامنة يدوياً من اللوحة (لما فشل أو لم يُطلب) — تبدأ عدّاد المحاولات من جديد */
export async function resyncInvoice(invoiceId: string): Promise<Invoice['wafeqStatus']> {
  await db.update(s.invoices).set({ wafeqStatus: 'pending', wafeqAttempts: 0, wafeqNextAt: nowIso(), wafeqError: '' })
    .where(and(eq(s.invoices.id, invoiceId), inArray(s.invoices.wafeqStatus, ['failed', 'off', 'pending'])))
  return syncInvoice(invoiceId)
}
