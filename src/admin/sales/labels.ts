export const ORDER_LABEL: Record<string, string> = {
  pending: 'بانتظار الدفع', paid: 'مدفوع', failed: 'فشل', canceled: 'ملغى', expired: 'منتهي', refunded: 'مسترد', partially_refunded: 'مسترد جزئياً',
}
export const ORDER_TONE: Record<string, string> = {
  pending: 'soon', paid: 'open', failed: 'full', canceled: 'draft', expired: 'draft', refunded: 'closed', partially_refunded: 'scheduled',
}
export const METHOD_LABEL: Record<string, string> = { gateway: 'دفع إلكتروني', free: 'مجاني', grant: 'منحة', bank_transfer: 'تحويل بنكي', cash: 'نقد' }
export const sar = (h: number) => (h / 100).toLocaleString('en-US', { minimumFractionDigits: h % 100 ? 2 : 0, maximumFractionDigits: 2 })
export const when = (iso: string | null) => iso ? new Date(iso).toLocaleString('ar-SA-u-nu-latn', { timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short' }) : '—'
