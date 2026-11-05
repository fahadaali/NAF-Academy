import 'server-only'
/* بوابة تجريبية محلية — لا تأخذ مالاً. معرّف الدفعة يحمل الطلب والمبلغ والنتيجة:
   mock_<orderId>_<amount>_<paid|failed>. للاختبار الآلي وتجربة الرحلة دون مفاتيح فقط. */
import type { Gateway } from './gateway'

export const mockGateway: Gateway = {
  kind: 'mock',
  mode: 'mock',
  publishableKey: 'pk_mock',
  async fetchPayment(id) {
    const m = id.match(/^mock_([0-9a-f-]{36})_(\d+)_(paid|failed)$/)
    if (!m) throw new Error('bad mock id')
    return { id, status: m[3], amount: Number(m[2]), currency: 'SAR', orderId: m[1], method: 'mada', message: m[3] === 'failed' ? 'رفضت الجهة المصدرة العملية' : 'APPROVED' }
  },
  async refund(paymentId) {
    return { id: paymentId, status: 'refunded' }
  },
}
