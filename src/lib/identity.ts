/* هوية المتدرب — حساب واحد لشخص واحد (دوال نقية، مشتركة بين الخادم والواجهة).
   البيانات الإلزامية قبل بدء أي دورة: الاسم بالعربية وبالإنجليزية ورقم الهوية والجوال.
   الثبات: رقم الهوية متى حُفظ، والاسمان متى اكتملت البيانات الإلزامية — لا يغيّرها المتدرب بعدها (الفريق وحده من ملف المتدرب). */

export type IdentityField = 'name' | 'nameEn' | 'nationalId' | 'phone'

export const IDENTITY_LABEL: Record<IdentityField, string> = {
  name: 'الاسم الكامل بالعربية',
  nameEn: 'الاسم الكامل بالإنجليزية',
  nationalId: 'رقم الهوية الوطنية أو الإقامة',
  phone: 'رقم الجوال',
}

/** الأرقام العربية والفارسية إلى لاتينية، وحذف المسافات والشرطات */
export const normalizeDigits = (raw: string) => raw
  .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
  .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
  .replace(/[\s-]/g, '')

/** رقم الهوية الوطنية أو الإقامة: 10 أرقام تبدأ بـ 1 (مواطن) أو 2 (مقيم)، وآخرها رقم تحقق (Luhn) */
export function validNationalId(raw: string): boolean {
  const v = normalizeDigits(raw)
  if (!/^[12]\d{9}$/.test(v)) return false
  let sum = 0
  for (let i = 0; i < 10; i++) {
    let d = Number(v[i])
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9 }
    sum += d
  }
  return sum % 10 === 0
}

/** للعرض في الصفحات وسجل النسخ (لا ملف PDF): أول رقمين وآخر ثلاثة */
export const maskId = (v: string) => (v.length > 5 ? `${v.slice(0, 2)}${'•'.repeat(v.length - 5)}${v.slice(-3)}` : v)

const words = (v: string) => v.trim().split(/\s+/).filter(Boolean).length

/** الاسم بالعربية: حروف عربية (والتشكيل) بكلمتين فأكثر — كما في الهوية */
export const validArabicName = (v: string) => /^[ء-غف-يـً-ْٰ\s]+$/.test(v.trim()) && words(v) >= 2

/** الاسم بالإنجليزية: حروف لاتينية بكلمتين فأكثر */
export const validEnglishName = (v: string) => /^[A-Za-z][A-Za-z .'-]*$/.test(v.trim()) && words(v) >= 2

type Learnerish = { name: string; nameEn: string; nationalId: string; phone: string }

/** ما ينقص من البيانات الإلزامية — فارغ = مكتملة */
export function identityGaps(l: Learnerish): IdentityField[] {
  const gaps: IdentityField[] = []
  if (!validArabicName(l.name)) gaps.push('name')
  if (!validEnglishName(l.nameEn)) gaps.push('nameEn')
  if (!validNationalId(l.nationalId)) gaps.push('nationalId')
  if (!l.phone) gaps.push('phone')
  return gaps
}

export const identityComplete = (l: Learnerish) => identityGaps(l).length === 0

/** ما ثبت فلا يغيّره المتدرب: الرقم متى حُفظ، والاسمان متى اكتملت البيانات */
export const lockedFields = (l: Learnerish) => ({ nationalId: !!l.nationalId, names: identityComplete(l) })

/** رقم هوية تجريبي صالح للمعاينة — ليس لشخص (يمرّ بفحص Luhn وحده) */
export const SAMPLE_ID = '1000000008'
