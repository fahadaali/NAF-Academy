import 'server-only'
import { getObject, putObject } from '../storage'
import { invoicePdf } from './pdf'
import type { schema } from '../db'

type Invoice = typeof schema.invoices.$inferSelect

/** الملف المخزّن أو يُولَّد ويُخزَّن — مفتاح ثابت لكل فاتورة */
export async function invoiceFile(inv: Invoice, o: { orderNumber: string; vatRate: number }): Promise<Uint8Array> {
  const key = `inv-${inv.id}.pdf`
  const have = await getObject(key)
  if (have) return have
  const bytes = await invoicePdf(inv, o)
  try { await putObject(key, bytes, 'application/pdf') } catch (e) { console.error('invoice pdf store', e) }
  return bytes
}
