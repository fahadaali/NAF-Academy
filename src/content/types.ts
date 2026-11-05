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

/** عرض عام: يُختار الأفضل للمشتري بينه وبين عرض الدورة، بلا تراكم */
export type Promo = { label: string; kind: 'percent' | 'amount'; value: number; startsAt?: string | null; endsAt?: string | null }

export type Pricing = {
  /** السعر الحالي بالهللة لتفادي أخطاء الفاصلة */
  amount: number
  /** السعر قبل العرض — يظهر مشطوباً */
  compareAt?: number
  /** بداية العرض ISO — قبلها يُدفع السعر الأصلي */
  saleStartsAt?: string
  /** نهاية العرض ISO — يظهر عدّاد تنازلي */
  saleEndsAt?: string
  /** العروض العامة المنطبقة على الدورة (المنصة كلها أو مسارها أو هي) */
  promos?: Promo[]
  free?: boolean
  /** سعر أرخص باقة — يُعرض «من …» */
  from?: boolean
}

export type MediaView = { url: string; alt: string; x: number; y: number; w: number; h: number }

export type Track = {
  slug: string
  description?: string
  cover?: MediaView
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
  subtitle?: string
  cover?: MediaView
  /** تتقدّم في الرئيسية */
  featured?: boolean
  /** ترتيب اللوحة (السحب) */
  order?: number
  /** كل المدربين بالترتيب — instructor هو الأول */
  instructors?: string[]
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
  /** دفعات الدورة الظاهرة — فارغ للدورة بلا دفعات */
  cohorts?: CohortView[]
  /** مدة الوصول بالأيام بعد التسجيل (أو بعد نهاية الدفعة) — غائبة = دائم */
  accessDays?: number
}

export type CohortView = {
  id: string
  title: string
  state: 'open' | 'full' | 'soon' | 'closed'
  startsAt?: string
  endsAt?: string
  seats?: { total: number; taken: number }
  city?: string
  venue?: string
}

export type Instructor = {
  slug: string
  name: string
  title: string
  highlights: string[]
  display: 'full' | 'compact' | 'hidden'
  featured?: boolean
  bio?: string
  photo?: MediaView
  /** صورة المشهد — للرئيسية وبطل صفحة المدرب (وإلا الرسمية) */
  scene?: MediaView
  links?: { label: string; url: string }[]
}

export type Stat = { value: number; suffix?: string; label: string }

export type LadderStep = {
  level: Level
  name: string
  title: string
  body: string
  gains: string[]
}
