export const ORDER_LABEL: Record<string, string> = {
  pending: 'بانتظار الدفع', paid: 'مدفوع', failed: 'فشل', canceled: 'ملغى', expired: 'منتهي', refunded: 'مسترد', partially_refunded: 'مسترد جزئياً',
}
export const ORDER_TONE: Record<string, string> = {
  pending: 'soon', paid: 'open', failed: 'full', canceled: 'draft', expired: 'draft', refunded: 'closed', partially_refunded: 'scheduled',
}
/** حالات الدفعة كما تأتي من البوابة، وعلامات الاسترداد التلقائي للدفعة اليتيمة (مقبوضة لطلب لم تدفعه) */
export const PAYMENT_LABEL: Record<string, string> = {
  initiated: 'بدأت', authorized: 'مفوّضة', paid: 'مقبوضة', captured: 'مقبوضة', failed: 'فشلت', refunded: 'مستردة', voided: 'ملغاة',
  orphan_refunding: 'يُسترد تلقائياً', orphan_refunded: 'استُردّت تلقائياً', orphan_refund_failed: 'تعذّر استردادها — يُعاد', orphan_needs_attention: 'تحتاج استرداداً يدوياً',
}
export const METHOD_LABEL: Record<string, string> = { gateway: 'دفع إلكتروني', free: 'مجاني', grant: 'منحة', bank_transfer: 'تحويل بنكي', cash: 'نقد' }
export const sar = (h: number) => (h / 100).toLocaleString('en-US', { minimumFractionDigits: h % 100 ? 2 : 0, maximumFractionDigits: 2 })
export const when = (iso: string | null) => iso ? new Date(iso).toLocaleString('ar-SA-u-nu-latn', { timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short' }) : '—'
