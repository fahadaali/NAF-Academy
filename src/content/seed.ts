/* محتوى مبدئي مقترح — يُستبدل كله من لوحة الإدارة. لا يُعتمد عليه كمحتوى حقيقي. */
import type { Course, Instructor, LadderStep, Stat, Track } from './types'

export const hero = {
  eyebrow: 'أكاديمية ناف',
  lines: ['القانون', 'يُتق~5َن', 'بالمم~3ارسة.'],
  phases: [
    { at: 0.1, text: 'كل خبرة تب~3دأ بنصّ.' },
    { at: 0.36, text: 'ثم تنتظم المعرفة سط~4راً بعد سطر.' },
    { at: 0.6, text: 'وتُبنى درج~3ةً فوق درجة.' },
    { at: 0.84, text: 'حتى تصير مهارةً تُم~4ارَس.' },
  ],
  cta: { label: 'استكشف المسارات', href: '#tracks' },
}

export const ladder: { title: string; steps: LadderStep[] } = {
  title: 'سُلّم الكفاءة',
  steps: [
    {
      level: 'practitioner',
      name: 'الدرجة الأولى',
      title: 'مم~2ارس',
      body: 'تأسيس متين في النصوص والإجراءات، تفهم فيه النظام كما يُطبَّق لا كما يُحفَظ.',
      gains: ['قراءة النص النظامي وتفكيكه', 'الإجراءات الأساسية أمام الجهات', 'صياغة المذكرات والعقود النموذجية'],
    },
    {
      level: 'proficient',
      name: 'الدرجة الثانية',
      title: 'متم~3كّن',
      body: 'تنتقل من المعرفة إلى التقدير: تحلّل الوقائع، وتوازن المخاطر، وتبني الحجة.',
      gains: ['تحليل القضايا والسوابق', 'إدارة مخاطر العقود', 'التفاوض وبناء الموقف القانوني'],
    },
    {
      level: 'expert',
      name: 'الدرجة الثالثة',
      title: 'خب~5ير',
      body: 'تقود الملفات المعقدة وتصمّم الحلول، وتوظّف التقنية والذكاء الاصطناعي في العمل القانوني.',
      gains: ['قيادة الإدارات القانونية', 'هندسة العقود المعقدة', 'التقنية القانونية والذكاء الاصطناعي'],
    },
  ],
}

export const tracks: Track[] = [
  { slug: 'contracts', title: 'العقود والصياغة', kicker: 'المسار ١', summary: 'من بنود العقد إلى هندسة الصفقة.', tone: 'gold', glyph: 'ع', courseCount: 6 },
  { slug: 'corporate', title: 'الشركات والحوكمة', kicker: 'المسار ٢', summary: 'تأسيس، حوكمة، اندماج واستحواذ.', tone: 'night', glyph: 'ش', courseCount: 5 },
  { slug: 'labor', title: 'نظام العمل', kicker: 'المسار ٣', summary: 'العلاقة العمالية من العقد إلى النزاع.', tone: 'olive', glyph: 'م', courseCount: 4 },
  { slug: 'litigation', title: 'التقاضي والإثبات', kicker: 'المسار ٤', summary: 'الإثبات والمرافعة والتنفيذ.', tone: 'ember', glyph: 'ق', courseCount: 7 },
  { slug: 'legaltech', title: 'التقنية القانونية', kicker: 'المسار ٥', summary: 'الذكاء الاصطناعي في العمل القانوني.', tone: 'ivory', glyph: 'ذ', courseCount: 3 },
  { slug: 'compliance', title: 'الامتثال', kicker: 'المسار ٦', summary: 'الأنظمة الرقابية وحماية البيانات.', tone: 'gold', glyph: 'ل', courseCount: 4 },
]

export const courses: Course[] = [
  {
    slug: 'contract-drafting-masterclass',
    title: 'صياغة العقود التجارية',
    track: 'contracts',
    level: 'proficient',
    mode: 'live',
    status: 'open',
    startsAt: '2026-12-06T18:00:00+03:00',
    hours: 12,
    seats: { total: 40, taken: 29 },
    pricing: { amount: 249000, compareAt: 349000, saleEndsAt: '2026-11-30T23:59:00+03:00' },
    instructor: 'i-1',
  },
  {
    slug: 'evidence-system-deep-dive',
    title: 'نظام الإثبات: من النص إلى المرافعة',
    track: 'litigation',
    level: 'practitioner',
    mode: 'onsite',
    status: 'open',
    startsAt: '2026-12-14T16:00:00+03:00',
    hours: 9,
    city: 'الرياض',
    seats: { total: 30, taken: 22 },
    pricing: { amount: 189000 },
    instructor: 'i-2',
  },
  {
    slug: 'ai-for-legal-departments',
    title: 'الذكاء الاصطناعي للإدارات القانونية',
    track: 'legaltech',
    level: 'expert',
    mode: 'blended',
    status: 'soon',
    startsAt: '2027-01-10T18:00:00+03:00',
    hours: 16,
    pricing: { amount: 399000 },
    instructor: 'i-3',
  },
  {
    slug: 'labor-disputes',
    title: 'النزاعات العمالية وتسويتها',
    track: 'labor',
    level: 'practitioner',
    mode: 'recorded',
    status: 'open',
    hours: 6,
    pricing: { amount: 79000, compareAt: 99000 },
    instructor: 'i-4',
  },
  {
    slug: 'corporate-governance',
    title: 'حوكمة الشركات ونظام الشركات الجديد',
    track: 'corporate',
    level: 'proficient',
    mode: 'live',
    status: 'full',
    startsAt: '2026-11-22T18:00:00+03:00',
    hours: 10,
    seats: { total: 35, taken: 35 },
    pricing: { amount: 219000 },
    instructor: 'i-1',
  },
  {
    slug: 'pdpl-compliance',
    title: 'الامتثال لنظام حماية البيانات الشخصية',
    track: 'compliance',
    level: 'proficient',
    mode: 'onsite',
    status: 'closed',
    startsAt: '2026-10-18T16:00:00+03:00',
    hours: 8,
    city: 'جدة',
    pricing: { amount: 159000 },
    instructor: 'i-2',
  },
]

export const instructors: Instructor[] = [
  { slug: 'i-1', name: 'مدرّب يُعلَن قريباً', title: 'محامٍ ومستشار عقود', highlights: ['خبرة في الصفقات التجارية', 'صياغة عقود الشركات'], display: 'full', featured: true },
  { slug: 'i-2', name: 'مدرّب يُعلَن قريباً', title: 'قاضٍ سابق', highlights: ['خبير الإثبات والمرافعات', 'تدريب القضاة والمحامين'], display: 'full' },
  { slug: 'i-3', name: 'مدرّب يُعلَن قريباً', title: 'خبير التقنية القانونية', highlights: ['أتمتة الإدارات القانونية', 'تطبيقات الذكاء الاصطناعي'], display: 'full' },
  { slug: 'i-4', name: 'مدرّب يُعلَن قريباً', title: 'مستشار موارد بشرية وعمل', highlights: ['تسوية النزاعات العمالية', 'السياسات الداخلية'], display: 'compact' },
]

export const stats: Stat[] = [
  { value: 29, label: 'دورة متخصصة' },
  { value: 6, label: 'مسارات تعليمية' },
  { value: 1200, suffix: '+', label: 'ساعة تدريبية' },
  { value: 94, suffix: '٪', label: 'نسبة الرضا' },
]

export const corporate = {
  title: 'برامج مصمّ~3مة لإدارتك القانونية',
  body: 'نبني مع فريقك برنامجاً على مقاس احتياجه: تقييم للمستوى، ومسار مخصّص، ولوحة متابعة لتقدّم كل عضو.',
  sizes: ['١–٥', '٦–١٥', '١٦–٥٠', '+٥٠'],
  interests: ['العقود', 'الشركات', 'العمل', 'التقاضي', 'التقنية القانونية', 'الامتثال'],
}

export const nav = [
  { href: '/#ladder', label: 'سُلّم الكفاءة' },
  { href: '/#tracks', label: 'المسارات' },
  { href: '/#courses', label: 'الدورات' },
  { href: '/#instructors', label: 'المدربون' },
  { href: '/#corporate', label: 'للمؤسسات' },
]
