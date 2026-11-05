/* أنواع المحتوى — مرآة لجداول D1 القادمة. كل ما هنا سيُدار من لوحة الإدارة. */

export type CourseStatus =
  | 'draft' // مسودة — لا تظهر
  | 'scheduled' // مجدولة النشر
  | 'soon' // قريباً — قائمة انتظار
  | 'open' // التسجيل مفتوح
  | 'full' // اكتمل العدد
  | 'closed' // انتهى التسجيل — ظاهرة بطبقة داكنة
  | 'archived'

export type DeliveryMode = 'recorded' | 'live' | 'onsite' | 'blended'
export type Level = 'practitioner' | 'proficient' | 'expert'

export type Pricing = {
  /** السعر الحالي بالهللة لتفادي أخطاء الفاصلة */
  amount: number
  /** السعر قبل العرض — يظهر مشطوباً */
  compareAt?: number
  /** نهاية العرض ISO — يظهر عدّاد تنازلي */
  saleEndsAt?: string
  free?: boolean
}

export type Track = {
  slug: string
  title: string
  kicker: string
  summary: string
  /** لون التمييز للمجلد من لوحة الهوية */
  tone: 'gold' | 'olive' | 'night' | 'ember' | 'ivory'
  glyph: string
  courseCount: number
}

export type Course = {
  slug: string
  title: string
  track: string
  level: Level
  mode: DeliveryMode
  status: CourseStatus
  startsAt?: string
  hours: number
  seats?: { total: number; taken: number }
  pricing: Pricing
  city?: string
  instructor: string
}

export type Instructor = {
  slug: string
  name: string
  title: string
  highlights: string[]
  display: 'full' | 'compact' | 'hidden'
  featured?: boolean
}

export type Stat = { value: number; suffix?: string; label: string }

export type LadderStep = {
  level: Level
  name: string
  title: string
  body: string
  gains: string[]
}
