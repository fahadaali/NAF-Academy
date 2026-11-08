import 'server-only'
import { getObject, putObject } from '../storage'
import { invoicePdf } from './pdf'
import type { schema } from '../db'

type Invoice = typeof schema.invoices.$inferSelect

/** الملف المحلي المخزّن أو يُولَّد ويُخزَّن — مفتاح ثابت لكل فاتورة */
export async function invoiceFile(inv: Invoice, o: { orderNumber: string; vatRate: number }): Promise<Uint8Array> {
  const key = `inv-${inv.id}.pdf`
  const have = await getObject(key)
  if (have) return have
  const bytes = await invoicePdf(inv, o)
  try { await putObject(key, bytes, 'application/pdf') } catch (e) { console.error('invoice pdf store', e) }
  return bytes
}

/** المستند الرسمي للمشتري: PDF وافق متى اكتملت مزامنته، وإلا المحلي.
    `wait`: المزامنة جارية — للبريد أن ينتظرها قليلاً (المحلي في `bytes` احتياطاً). */
export async function officialFile(inv: Invoice, o: { orderNumber: string; vatRate: number }): Promise<{ bytes: Uint8Array; source: 'wafeq' | 'local'; wait: boolean }> {
  if (inv.wafeqStatus === 'done' && inv.wafeqId) {
    const { wafeqPdfKey } = await import('../wafeq/sync')
    let bytes = await getObject(wafeqPdfKey(inv.id))
    if (!bytes) {
      /* ملف لم يُخزَّن (تخزين مُفرَّغ): يُنزَّل من وافق مرة أخرى */
      try {
        const { wafeqPdf } = await import('../wafeq/client')
        bytes = await wafeqPdf(`/${inv.kind === 'invoice' ? 'invoices' : 'credit-notes'}/${inv.wafeqId}/download/`)
        await putObject(wafeqPdfKey(inv.id), bytes, 'application/pdf')
      } catch (e) { console.error('wafeq pdf', (e as Error).message) }
    }
    if (bytes) return { bytes, source: 'wafeq', wait: false }
  }
  return { bytes: await invoiceFile(inv, o), source: 'local', wait: inv.wafeqStatus === 'pending' || inv.wafeqStatus === 'running' }
}
