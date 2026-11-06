import 'server-only'
/* إعدادات الموقع المخزّنة (مفتاح ← JSON) مع قيم افتراضية. */
import { eq } from 'drizzle-orm'
import { db, schema as s } from './db'

export type PaymentSettings = {
  enabled: boolean
  methods: ('creditcard' | 'applepay' | 'stcpay')[]
  holdMinutes: number
  vatRate: number
  seller: { name: string; vatNumber: string; crNumber: string; address: string }
  orderPrefix: string
  invoicePrefix: string
  refundPolicy: string
  terms: string
}

export const DEFAULT_PAYMENTS: PaymentSettings = {
  enabled: false,
  methods: ['creditcard', 'applepay', 'stcpay'],
  holdMinutes: 30,
  vatRate: 15,
  seller: { name: 'شركة ناف للمحاماة والاستشارات القانونية', vatNumber: '', crNumber: '', address: 'الرياض، المملكة العربية السعودية' },
  orderPrefix: 'NA',
  invoicePrefix: 'INV',
  refundPolicy: 'يُسترد المبلغ كاملاً عند الإلغاء قبل بدء الدورة بسبعة أيام، ونصفه قبلها بثلاثة أيام، ولا استرداد بعد ذلك.',
  terms: 'بإتمام التسجيل توافق على شروط الأكاديمية وسياسة الاسترداد.',
}

/** قاعدة لم تُهيّأ بعد (قبل /setup): لا جداول — يُعاد الافتراضي فتعمل صفحة التهيئة وغلاف الموقع */
export const notMigrated = (e: unknown) => /no such table/i.test(String((e as { cause?: unknown })?.cause ?? e) + String(e))

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  let row: typeof s.settings.$inferSelect | undefined
  try {
    ;[row] = await db.select().from(s.settings).where(eq(s.settings.key, key))
  } catch (e) {
    if (notMigrated(e)) return fallback
    throw e
  }
  if (!row) return fallback
  const v = row.value as Partial<T>
  return (typeof fallback === 'object' && fallback && !Array.isArray(fallback) ? { ...fallback, ...v } : v) as T
}

export async function setSetting(key: string, value: unknown) {
  await db.insert(s.settings).values({ key, value }).onConflictDoUpdate({ target: s.settings.key, set: { value, updatedAt: new Date().toISOString() } })
}

export const paymentSettings = () => getSetting<PaymentSettings>('payments', DEFAULT_PAYMENTS)

/** من يُبلَّغ بطلبات المؤسسات */
export type CorporateSettings = { notify: string[] }
export const corporateSettings = () => getSetting<CorporateSettings>('corporate', { notify: [] })
