import 'server-only'
/* بوابة تجريبية محلية — لا تأخذ مالاً. معرّف الدفعة يحمل الطلب والمبلغ والنتيجة:
   mock_<orderId>_<amount>_<paid|failed|initiated>. للاختبار الآلي وتجربة الرحلة دون مفاتيح فقط.
   `mockControl` للاختبارات: حالة تتغيّر لاحقاً (initiated ← paid)، واسترداد يفشل، وسجل الاستردادات. */
import type { Gateway } from './gateway'

export const mockControl = {
  /** حالة تحلّ محل ما في المعرّف — دفعة بدأت معلّقة ثم قُبضت */
  status: new Map<string, string>(),
  /** يرفض الاسترداد بهذا العدد من المرات ثم يقبل */
  refundFailures: 0,
  /** كل استرداد قبلته البوابة */
  refunds: [] as { paymentId: string; amount: number }[],
}

export const mockGateway: Gateway = {
  kind: 'mock',
  mode: 'mock',
  publishableKey: 'pk_mock',
  async fetchPayment(id) {
    const m = id.match(/^mock_([0-9a-f-]{36})_(\d+)_(paid|failed|initiated)$/)
    if (!m) throw new Error('bad mock id')
    const status = mockControl.status.get(id) ?? m[3]
    return { id, status, amount: Number(m[2]), currency: 'SAR', orderId: m[1], method: 'mada', message: status === 'failed' ? 'رفضت الجهة المصدرة العملية' : 'APPROVED' }
  },
  async refund(paymentId, amount) {
    if (mockControl.refundFailures > 0) {
      mockControl.refundFailures--
      throw new Error('mock refund rejected')
    }
    mockControl.refunds.push({ paymentId, amount })
    return { id: paymentId, status: 'refunded' }
  },
}
