/* كتالوج الرسائل الآلية — الأحداث، والقوالب الافتراضية (تُعدَّل من اللوحة)، وتوقيتات الجدولة.
   مشترك بين الخادم والمحرّر والاختبارات. لا نص رسالة في الشيفرة إلا هذه البذرة الافتراضية. */

export const EVENTS = [
  'enrolled', 'session_reminder', 'session_followup', 'drip_unlocked',
  'inactive_nudge', 'halfway', 'completed',
  'registration_open', 'sale_ending', 'cart_abandoned',
  'certificate_issued', 'order_paid', 'refund_issued',
  'cohort_transfer', 'access_ending', 'recording_ready',
] as const
export type EventKey = (typeof EVENTS)[number]

/** معاملاتية: تُرسل دائماً. تحفيز وعروض: تحترم إلغاء الاشتراك */
export type Category = 'transactional' | 'engagement' | 'marketing'

export type Template = {
  enabled: boolean
  subject: string
  heading: string
  body: string
  cta: string
  /** زر ثانٍ (التقييم أو LinkedIn) — فارغ = بلا زر */
  cta2?: string
  sms: string
}

export type Offset = { minutes: number; email: boolean; sms: boolean }

export type NotifySettings = {
  templates: Record<EventKey, Template>
  /** تذكيرات الجلسة: كم دقيقة قبلها وبأي قناة */
  sessionOffsets: Offset[]
  /** متابعة ما بعد الجلسة: دقائق بعد نهايتها */
  followupDelay: number
  /** التحفيز: أيام بلا نشاط */
  inactiveDays: number
  /** انتهاء العرض: ساعات قبل انتهائه */
  saleHours: number
  /** السلة المتروكة: دقائق بعد إنشاء الطلب */
  cartDelays: number[]
  /** كوبون يُرفق بتذكير السلة الأخير (اختياري) */
  cartCoupon: string
}

export type EventMeta = {
  label: string
  hint: string
  category: Category
  /** يدعم الرسالة النصية؟ */
  sms: boolean
  /** المتغيرات المتاحة لهذا الحدث */
  vars: string[]
  /** صفوف التفاصيل في البريد: [العنوان، المتغير] — تُعرض إن كان للمتغير قيمة */
  facts: [string, string][]
  /** رابط الزر الثاني (متغيّر) — يغيب الزر إن كان فارغاً */
  cta2Var?: 'review_url' | 'linkedin_url'
}

export const VAR_LABEL: Record<string, string> = {
  name: 'اسم المتدرب', course: 'اسم الدورة', lesson: 'الدرس أو الجلسة', when: 'الموعد', location: 'المكان',
  starts: 'بداية الدورة', link: 'رابط الدرس أو الدورة', calendar: 'رابط التقويم', pct: 'نسبة الإنجاز',
  price: 'السعر', ends: 'انتهاء العرض', coupon: 'الكوبون', order: 'رقم الطلب', left: 'المتبقي على الجلسة',
  code: 'رقم الشهادة', total: 'المبلغ المدفوع', amount: 'المبلغ المسترد', seats: 'عدد المقاعد',
  cohort: 'الدفعة', until: 'نهاية الوصول', review_url: 'رابط تقييم الدورة', linkedin_url: 'رابط الإضافة إلى LinkedIn',
}

const COMMON = ['name', 'course', 'link']

export const EVENT_META: Record<EventKey, EventMeta> = {
  enrolled: {
    label: 'تأكيد التسجيل والترحيب', hint: 'فور التسجيل — مع رابط التقويم وخطوات البدء', category: 'transactional', sms: true,
    vars: [...COMMON, 'starts', 'calendar', 'order'], facts: [['تبدأ', 'starts'], ['رقم الطلب', 'order']],
  },
  session_reminder: {
    label: 'تذكير الجلسة', hint: 'قبل الجلسة المباشرة أو الحضورية بالتوقيتات المحددة', category: 'transactional', sms: true,
    vars: [...COMMON, 'lesson', 'when', 'left', 'location', 'calendar'], facts: [['الجلسة', 'lesson'], ['الموعد', 'when'], ['المكان', 'location']],
  },
  session_followup: {
    label: 'ما بعد الجلسة', hint: 'بعد انتهاء الجلسة: التسجيل والواجب والتقييم', category: 'transactional', sms: false,
    vars: [...COMMON, 'lesson', 'review_url'], facts: [['الجلسة', 'lesson']], cta2Var: 'review_url',
  },
  drip_unlocked: {
    label: 'درس جديد متاح', hint: 'حين يُفتح درس مجدول بالفتح المتدرّج', category: 'transactional', sms: false,
    vars: [...COMMON, 'lesson'], facts: [['الدرس', 'lesson']],
  },
  inactive_nudge: {
    label: 'تحفيز بعد التوقف', hint: 'إن توقف المتدرب عن دورة لم يكملها', category: 'engagement', sms: false,
    vars: [...COMMON, 'pct'], facts: [['إنجازك', 'pct']],
  },
  halfway: {
    label: 'تهنئة منتصف الطريق', hint: 'عند بلوغ 50% من الدورة', category: 'engagement', sms: false,
    vars: [...COMMON, 'pct'], facts: [],
  },
  completed: {
    label: 'تهنئة الإكمال', hint: 'عند إكمال كل الدروس', category: 'engagement', sms: false,
    vars: [...COMMON, 'review_url'], facts: [], cta2Var: 'review_url',
  },
  registration_open: {
    label: 'فُتح التسجيل', hint: 'لمن طلب إبلاغه أو انتظر مقعداً أو دفعة قادمة', category: 'marketing', sms: true,
    vars: [...COMMON, 'starts', 'price'], facts: [['تبدأ', 'starts'], ['السعر', 'price']],
  },
  sale_ending: {
    label: 'قرب انتهاء العرض', hint: 'لمن أبدى اهتمامه ولم يسجّل', category: 'marketing', sms: false,
    vars: [...COMMON, 'price', 'ends'], facts: [['السعر', 'price'], ['ينتهي العرض', 'ends']],
  },
  cart_abandoned: {
    label: 'السلة المتروكة', hint: 'طلب لم يكتمل دفعه', category: 'marketing', sms: false,
    vars: [...COMMON, 'price', 'coupon'], facts: [['السعر', 'price'], ['كوبون', 'coupon']],
  },
  certificate_issued: {
    label: 'صدور الشهادة', hint: 'بعد اعتماد الشهادة', category: 'transactional', sms: true,
    vars: [...COMMON, 'code', 'linkedin_url'], facts: [['رقم الشهادة', 'code']], cta2Var: 'linkedin_url',
  },
  order_paid: {
    label: 'تأكيد الطلب والفاتورة', hint: 'فور اكتمال الدفع — للمشتري ولو اشترى مقاعد لفريقه دون أن يحضر، برابط الطلب والفاتورة الضريبية', category: 'transactional', sms: false,
    vars: ['name', 'course', 'link', 'order', 'total', 'seats'], facts: [['رقم الطلب', 'order'], ['المبلغ', 'total'], ['المقاعد', 'seats']],
  },
  refund_issued: {
    label: 'استرداد مبلغ', hint: 'بعد تنفيذ استرداد كامل أو جزئي من اللوحة — برابط الطلب والإشعار الدائن', category: 'transactional', sms: false,
    vars: ['name', 'course', 'link', 'order', 'amount'], facts: [['رقم الطلب', 'order'], ['المبلغ المسترد', 'amount']],
  },
  cohort_transfer: {
    label: 'النقل إلى دفعة', hint: 'حين ينقل الفريق المتدرب إلى دفعة أخرى — بمواعيدها الجديدة', category: 'transactional', sms: true,
    vars: [...COMMON, 'cohort', 'starts', 'calendar'], facts: [['الدفعة', 'cohort'], ['تبدأ', 'starts']],
  },
  recording_ready: {
    label: 'تسجيل الجلسة متاح', hint: 'حين يُضاف تسجيل جلسة مباشرة (تلقائياً من Zoom أو يدوياً)', category: 'transactional', sms: false,
    vars: [...COMMON, 'lesson'], facts: [['الجلسة', 'lesson']],
  },
  access_ending: {
    label: 'قرب انتهاء الوصول', hint: 'قبل انتهاء مدة الوصول إلى الدورة بأسبوع', category: 'engagement', sms: false,
    vars: [...COMMON, 'until', 'pct'], facts: [['ينتهي الوصول', 'until'], ['إنجازك', 'pct']],
  },
}

const t = (subject: string, heading: string, body: string, cta: string, sms = '', cta2 = ''): Template => ({ enabled: true, subject, heading, body, cta, sms, cta2 })

export const DEFAULT_NOTIFY: NotifySettings = {
  templates: {
    enrolled: t('تمّ تسجيلك في {{course}}', 'أهلاً بك يا {{name}}', 'سُجّلت في «{{course}}». كل ما تحتاجه في مساحة التعلّم: الدروس، والجلسات، والمرفقات.\n\n- أضف مواعيد الدورة إلى تقويمك\n- ستصلك التذكيرات قبل كل جلسة\n- اسأل المدرب تحت أي درس', 'ابدأ التعلّم', 'أكاديمية ناف: سُجّلت في {{course}}. مساحة التعلّم: {{link}}'),
    session_reminder: t('تذكير: {{lesson}} — {{left}}', 'جلستك {{left}}', 'تبدأ جلسة «{{lesson}}» من دورة «{{course}}» {{when}}.\n\nيُفعَّل زر الانضمام قبل الموعد بربع ساعة.', 'تفاصيل الجلسة', 'أكاديمية ناف: {{lesson}} {{left}}. {{link}}'),
    session_followup: t('بعد جلسة {{lesson}}', 'شكراً لحضورك', 'انتهت جلسة «{{lesson}}». تجد في مساحة التعلّم التسجيل إن أُتيح، والمرفقات، والواجب إن وُجد.\n\nرأيك يهمنا لتحسين الجلسات القادمة.', 'افتح الدرس', '', 'قيّم الدورة'),
    drip_unlocked: t('درس جديد: {{lesson}}', 'درس جديد بانتظارك', 'فُتح درس «{{lesson}}» في دورة «{{course}}».', 'ابدأ الدرس'),
    inactive_nudge: t('نكمل {{course}}؟', 'اشتقنا لك يا {{name}}', 'أنجزت {{pct}} من «{{course}}». خطوة صغيرة اليوم تقرّبك من الشهادة.', 'تابع من حيث توقفت'),
    halfway: t('منتصف الطريق في {{course}}', 'أنجزت نصف الدورة', 'أحسنت يا {{name}} — بلغت منتصف «{{course}}». استمر بالإيقاع نفسه.', 'تابع التعلّم'),
    completed: t('أكملت {{course}}', 'مبارك الإكمال', 'أكملت كل دروس «{{course}}». تُراجَع متطلبات الشهادة وتصلك فور اعتمادها. رأيك في الدورة يعين غيرك على الاختيار.', 'مساحة التعلّم', '', 'قيّم الدورة'),
    registration_open: t('فُتح التسجيل: {{course}}', 'التسجيل مفتوح الآن', 'طلبت إبلاغك بدورة «{{course}}» — فُتح التسجيل والمقاعد محدودة.', 'سجّل الآن', 'أكاديمية ناف: فُتح التسجيل في {{course}}. {{link}}'),
    sale_ending: t('العرض ينتهي قريباً: {{course}}', 'العرض على وشك الانتهاء', 'سعر «{{course}}» الحالي {{price}} ينتهي {{ends}}.', 'سجّل بالسعر الحالي'),
    cart_abandoned: t('أكمل تسجيلك في {{course}}', 'مقعدك بانتظارك', 'بدأت التسجيل في «{{course}}» ولم يكتمل. يمكنك المتابعة من حيث توقفت.', 'أكمل التسجيل'),
    certificate_issued: t('صدرت شهادتك: {{course}}', 'مبارك يا {{name}}', 'صدرت شهادة إتمام «{{course}}». يمكنك تنزيلها ومشاركتها، ويتحقق منها أي أحد برقمها.', 'عرض الشهادة', 'أكاديمية ناف: صدرت شهادتك في {{course}}. {{link}}', 'أضفها إلى LinkedIn'),
    order_paid: t('طلبك {{order}}: {{course}}', 'اكتمل طلبك', 'استلمنا دفعتك لـ«{{course}}». تجد الفاتورة الضريبية وتفاصيل الطلب في صفحته، ومنها يُخصَّص كل مقعد لصاحبه إن اشتريت لفريقك.', 'الطلب والفاتورة'),
    cohort_transfer: t('انتقلت إلى {{cohort}}: {{course}}', 'دفعتك الجديدة', 'نُقل تسجيلك في «{{course}}» إلى «{{cohort}}». تقدّمك محفوظ، ومواعيد الجلسات صارت مواعيد الدفعة الجديدة — أضفها إلى تقويمك.', 'مساحة التعلّم', 'أكاديمية ناف: انتقلت إلى {{cohort}} في {{course}}. {{link}}'),
    recording_ready: t('تسجيل {{lesson}} متاح الآن', 'شاهد التسجيل متى شئت', 'أُضيف تسجيل جلسة «{{lesson}}» من دورة «{{course}}» — تجده تحت الجلسة في مساحة التعلّم.', 'شاهد التسجيل'),
    access_ending: t('وصولك إلى {{course}} ينتهي قريباً', 'أسبوع على نهاية الوصول', 'ينتهي وصولك إلى «{{course}}» في {{until}}، وأنجزت {{pct}}. أكمل ما بقي قبل الموعد، أو جدّد الوصول من صفحة الدورة.', 'تابع التعلّم'),
    refund_issued: t('استرداد لطلبك {{order}}', 'نفّذنا الاسترداد', 'أُعيد {{amount}} من طلب «{{course}}» إلى وسيلة الدفع نفسها، ويصل خلال المدة المعتادة لدى البنك. الإشعار الدائن في صفحة الطلب.', 'صفحة الطلب'),
  },
  sessionOffsets: [
    { minutes: 7 * 1440, email: true, sms: false },
    { minutes: 1440, email: true, sms: false },
    { minutes: 60, email: true, sms: true },
    { minutes: 10, email: true, sms: true },
  ],
  followupDelay: 60,
  inactiveDays: 7,
  saleHours: 48,
  cartDelays: [60, 1440],
  cartCoupon: '',
}

/** دمج الإعداد المخزّن مع الافتراضي — حدث جديد يأخذ قالبه الافتراضي */
export function mergeNotify(v: Partial<NotifySettings> | null | undefined): NotifySettings {
  const templates = { ...DEFAULT_NOTIFY.templates }
  for (const k of EVENTS) if (v?.templates?.[k]) templates[k] = { ...DEFAULT_NOTIFY.templates[k], ...v.templates[k] }
  return { ...DEFAULT_NOTIFY, ...v, templates }
}

/** تعبئة {{متغير}} — المتغير الغائب يُترك فارغاً */
export function fill(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? '')
}

/** عدد بصيغة عربية سليمة: بعد يوم/يومين/3 أيام/11 يوماً */
function count(n: number, one: string, two: string, few: string, many: string) {
  if (n === 1) return one
  if (n === 2) return two
  return n <= 10 ? `${n} ${few}` : `${n} ${many}`
}

/** «غداً» و«بعد ساعة» و«بعد 10 دقائق» — للتذكير */
export function leftLabel(minutes: number) {
  if (minutes === 7 * 1440) return 'بعد أسبوع'
  if (minutes === 1440) return 'غداً'
  if (minutes >= 1440) return `بعد ${count(Math.round(minutes / 1440), 'يوم', 'يومين', 'أيام', 'يوماً')}`
  if (minutes >= 60) return `بعد ${count(Math.round(minutes / 60), 'ساعة', 'ساعتين', 'ساعات', 'ساعة')}`
  return `بعد ${count(minutes, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة')}`
}

/** «بأسبوع» و«بيوم» و«بساعة» و«بـ10 دقائق» — مدة «قبل الجلسة» كما تُكتب في الواجهة */
export function beforeLabel(minutes: number) {
  if (minutes % (7 * 1440) === 0 && minutes / (7 * 1440) === 1) return 'بأسبوع'
  if (minutes >= 1440) { const n = Math.round(minutes / 1440); return n === 1 ? 'بيوم' : n === 2 ? 'بيومين' : `بـ${count(n, '', '', 'أيام', 'يوماً')}` }
  if (minutes >= 60) { const n = Math.round(minutes / 60); return n === 1 ? 'بساعة' : n === 2 ? 'بساعتين' : `بـ${count(n, '', '', 'ساعات', 'ساعة')}` }
  return minutes === 1 ? 'بدقيقة' : minutes === 2 ? 'بدقيقتين' : `بـ${count(minutes, '', '', 'دقائق', 'دقيقة')}`
}

/** مهلة السماح: إن فات موعد التذكير بأكثر منها لا يُرسل (لا تذكير متأخر بلا معنى) */
export function graceMinutes(offset: number) {
  return Math.max(10, Math.min(360, Math.floor(offset / 2)))
}

/** هل حان موعد تذكير الجلسة؟ */
export function reminderDue(startsAt: string, offsetMin: number, now: Date, enrolledAt: string): { due: false } | { due: true; at: string } {
  const at = Date.parse(startsAt) - offsetMin * 60e3
  const t = now.getTime()
  if (at > t) return { due: false }
  if (t - at > graceMinutes(offsetMin) * 60e3) return { due: false }
  if (t >= Date.parse(startsAt)) return { due: false }
  if (Date.parse(enrolledAt) >= at) return { due: false }
  return { due: true, at: new Date(at).toISOString() }
}

/** محاولات الإرسال: 5 دقائق ثم 30 ثم ساعتان، ثم يُعدّ فاشلاً */
export const BACKOFF_MIN = [5, 30, 120]
