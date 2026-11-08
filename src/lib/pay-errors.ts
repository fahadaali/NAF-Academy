/* رسائل رفض الدفع بالعربية — ميسر تعيد رسالة البنك بالإنجليزية (source.message)، ولا تُعرض للمتدرب كما هي:
   تُطابق بأنماط معروفة، وما لا يُعرف يصير عبارة عامة. لا يُعرض نص الرابط حرفياً (قد يُصنع رابط برسالة مضلِّلة). */

const RULES: [RegExp, string][] = [
  [/insufficient/i, 'الرصيد غير كافٍ.'],
  [/expired/i, 'البطاقة منتهية الصلاحية.'],
  [/lost|stolen/i, 'البطاقة موقوفة لدى البنك.'],
  [/withdrawal limit|exceeds/i, 'العملية تتجاوز الحد المسموح للبطاقة.'],
  [/invalid card|not found|card number|invalid.*(cvc|cvv|expiry)/i, 'بيانات البطاقة غير صحيحة.'],
  [/not enrolled/i, 'البطاقة غير مفعّلة للشراء عبر الإنترنت — فعّلها من تطبيق البنك.'],
  [/online purchase|attempted but not available/i, 'الشراء عبر الإنترنت غير مفعّل للبطاقة — فعّله من تطبيق البنك.'],
  [/rejected by the issuer|authentication.*(rejected|failed)|3ds.*(rejected|failed)/i, 'لم يكتمل التحقق من البنك.'],
  [/authentication is unavailable|3ds service|service error|try again later/i, 'تعذّر التحقق من البنك الآن — حاول بعد قليل.'],
  [/cancel/i, 'أُلغيت العملية.'],
  [/timeout|timed out/i, 'انتهت مهلة العملية.'],
  [/declined|do not honou?r|unspecified/i, 'رفض البنك العملية.'],
]

/** رسائلنا العربية التي تمرّ كما هي */
const OWN = new Set(['تعذّر التحقق من الدفعة'])

/** سبب الرفض للمتدرب بالعربية — دائماً جملة كاملة */
export function payFailureAr(raw: string | null | undefined): string {
  const m = String(raw ?? '').trim()
  if (OWN.has(m)) return `${m}.`
  for (const [re, ar] of RULES) if (re.test(m)) return ar
  return 'رُفضت العملية.'
}
