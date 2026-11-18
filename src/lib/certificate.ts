/* الشهادة — أنواع القالب وشروط الإصدار، مشتركة بين الخادم ومحرّر اللوحة والمعاينة.
   الصفحة A4 أفقية بنقاط PDF (842×595)، ومواضع العناصر نسب مئوية فتتطابق المعاينة وملف PDF. */

export const PAGE = { w: 842, h: 595 } as const

export type CertRules = {
  enabled: boolean
  /** نسبة الدروس القابلة للإكمال (فيديو، مقال، ملف، سلايدات، اختبار، واجب) */
  lessonsPct: number
  /** نسبة حضور الجلسات المباشرة والحضورية */
  attendancePct: number
  /** النجاح في كل اختبارات الدورة */
  quizzes: boolean
  /** قبول كل واجبات الدورة */
  assignments: boolean
  /** اعتماد تلقائي بلا مراجعة */
  autoApprove: boolean
  templateId: string | null
}

export const DEFAULT_RULES: CertRules = { enabled: true, lessonsPct: 100, attendancePct: 75, quizzes: true, assignments: true, autoApprove: false, templateId: null }

export const BLOCKS = ['brand', 'title', 'lead', 'name', 'idNumber', 'course', 'hours', 'date', 'signatures', 'qr', 'stamp'] as const
export type BlockKey = (typeof BLOCKS)[number]
export type Block = { x: number; y: number; size: number; show: boolean }

export type Signatory = { name: string; title: string; signatureId: string | null; titleEn?: string; nameEn?: string }

/** سطر الموقّع الإنجليزي في الثنائية: الاسم والصفة معاً («Name, Title») — فلا يزيد التوقيع سطراً */
export const signerEn = (s: Signatory) => [s.nameEn?.trim(), s.titleEn?.trim()].filter(Boolean).join(', ')

/** نصوص الوجه الإنجليزي للشهادة الثنائية — {{hours}} للساعات */
export type CertEnglish = { title: string; lead: string; courseLead: string; hoursText: string; issued: string; idLabel: string }

/** تخطيط الشهادة الثنائية: stacked سطر إنجليزي تحت كل عربي، وsplit عمودان — العربي يميناً والإنجليزي يساراً */
export type CertLayout = 'stacked' | 'split'

export type CertDesign = {
  tone: 'ivory' | 'night'
  backgroundId: string | null
  /** صورة الختم (PNG شفاف) — تُرسم في عنصر stamp إن رُفعت */
  stampId: string | null
  /** ميلان الختم بالدرجات مع عقارب الساعة (يميناً) — كختم مطبوع باليد */
  stampRotate: number
  title: string
  lead: string
  courseLead: string
  hoursText: string
  /** ما قبل رقم الهوية */
  idLabel: string
  /** سطر «CERTIFICATE OF COMPLETION» تحت العنوان */
  english: boolean
  /** ثنائية اللغة كاملة: تحت كل سطر عربي سطره الإنجليزي (العنوان، التمهيد، الاسم، الدورة، الساعات، التاريخ، المسمّيات) */
  bilingual: boolean
  /** split يعني ثنائية اللغة دائماً — مواضع العناصر النصية الأفقية يحددها العمودان، والرأسية من blocks */
  layout: CertLayout
  en: CertEnglish
  signatories: Signatory[]
  blocks: Record<BlockKey, Block>
}

export const BLOCK_LABEL: Record<BlockKey, string> = {
  brand: 'العلامة', title: 'العنوان', lead: 'التمهيد', name: 'اسم المتدرب', idNumber: 'رقم الهوية', course: 'الدورة',
  hours: 'الساعات', date: 'التاريخ', signatures: 'التوقيعات', qr: 'رمز التحقق', stamp: 'الختم',
}

const b = (x: number, y: number, size: number): Block => ({ x, y, size, show: true })

export const DEFAULT_DESIGN: CertDesign = {
  tone: 'ivory',
  backgroundId: null,
  stampId: null,
  stampRotate: 12,
  title: 'شهادة إتم~4ام',
  lead: 'تُمنح هذه الشهادة إلى',
  courseLead: 'لإتمام متطلبات دورة',
  hoursText: 'بواقع {{hours}} ساعة تدريبية',
  idLabel: 'رقم الهوية:',
  english: true,
  bilingual: false,
  layout: 'stacked',
  en: { title: 'Certificate of Completion', lead: 'This certificate is awarded to', courseLead: 'for completing the requirements of', hoursText: '{{hours}} training hours', issued: 'Issued on', idLabel: 'ID No.:' },
  signatories: [{ name: 'مدير الأكاديمية', title: 'أكاديمية ناف', signatureId: null, titleEn: 'NAF Academy' }],
  blocks: {
    brand: b(50, 12, 15),
    title: b(50, 26, 44),
    lead: b(50, 38, 15),
    name: b(50, 48, 36),
    /* تحت الساعات: بين الاسم والدورة لا متّسع للسطرين في الثنائية. الشهادات القديمة بلا رقم لا يُرسم لها السطر */
    idNumber: b(50, 75.5, 11),
    course: b(50, 61, 19),
    hours: b(50, 69, 12),
    date: b(18, 86, 11),
    signatures: b(50, 85, 12),
    qr: b(84, 83, 64),
    /* الختم مقابل رمز التحقق — size ارتفاعه بالنقاط */
    stamp: b(16, 70, 70),
  },
}

/** مواضع التخطيط المنقسم: العلامة في الوسط، والنصوص والتاريخان في عمودين (x يتجاهله العمودان)،
    والموقّعون (حتى ثلاثة بفاصل 190 نقطة) وحدهم في الصف الأخير فلا يقعون تحت التاريخين */
export const SPLIT_BLOCKS: Record<BlockKey, Block> = {
  brand: b(50, 12.5, 13),
  title: b(50, 29, 30),
  lead: b(50, 38, 12.5),
  name: b(50, 46.5, 22),
  idNumber: b(50, 53, 12),
  course: b(50, 63.5, 15),
  hours: b(50, 70.5, 11),
  date: b(50, 77, 9.5),
  signatures: b(50, 87.5, 10.5),
  qr: b(88.5, 84, 46),
  /* الختم يساراً مقابل رمز التحقق يميناً */
  stamp: b(10.5, 83.5, 92),
}

/** قالب البذرة الافتراضي (وترحيل 0022 للقاعدة القائمة): الشهادة الثنائية بعمودين — بقرار المالك */
export const SPLIT_TEMPLATE = { name: 'شهادة ثنائية — عربي وإنجليزي', design: { ...DEFAULT_DESIGN, layout: 'split', bilingual: true, blocks: SPLIT_BLOCKS } as CertDesign }

/** العمودان في التخطيط المنقسم — مركز كل عمود وعرضه الأقصى بالنسب (العربي يميناً) */
export const SPLIT = { ar: 74, en: 26, width: 40, divider: { from: 24, to: 80 } } as const

/** سطر التاريخ في التخطيط المنقسم (بقرار المالك): العربي باليوم والهجري «صدرت يوم الخميس 14 جمادى الأولى 1448هـ»،
    والإنجليزي باليوم والميلادي «Issued on Thursday, 5 November 2026». بلا هجري يعود إلى الميلادي */
type DateParts = { date: string; hijri: string; dateEn?: string; dayAr?: string; dayEn?: string }
export const splitDateAr = (d: DateParts) => (d.hijri ? `صدرت يوم ${d.dayAr ? `${d.dayAr} ` : ''}${d.hijri}هـ` : `صدرت في ${d.date}`)
export const splitDateEn = (d: DateParts, issued: string) => (d.dateEn ? `${issued} ${d.dayEn ? `${d.dayEn}, ` : ''}${d.dateEn}` : '')

/** «{{hours}}» في سطر الساعات — للصفحة وملف PDF */
export const hoursOf = (t: string, h: number) => t.replace(/\{\{\s*hours\s*\}\}/g, String(h))

/** دمج قالب مخزّن مع الافتراضي — عنصر جديد يأخذ موضعه الافتراضي لتخطيطه */
export function mergeDesign(v: Partial<CertDesign> | null | undefined): CertDesign {
  const layout: CertLayout = v?.layout === 'split' ? 'split' : 'stacked'
  const base = layout === 'split' ? SPLIT_BLOCKS : DEFAULT_DESIGN.blocks
  const blocks = { ...base }
  for (const k of BLOCKS) if (v?.blocks?.[k]) blocks[k] = { ...base[k], ...v.blocks[k] }
  return {
    ...DEFAULT_DESIGN, ...v, blocks, layout, idLabel: v?.idLabel ?? DEFAULT_DESIGN.idLabel,
    en: { ...DEFAULT_DESIGN.en, ...(v?.en ?? {}) }, bilingual: layout === 'split' || (v?.bilingual ?? false), signatories: v?.signatories ?? DEFAULT_DESIGN.signatories,
  }
}

export const mergeRules = (v: Partial<CertRules> | null | undefined): CertRules => ({ ...DEFAULT_RULES, ...v })

/** ألوان الشهادة — مرآة لرموز الهوية (ملف PDF لا يقرأ متغيرات CSS) */
export const TONES = {
  ivory: { bg: '#f8f4ea', ink: '#0b1520', soft: '#4a5560', gold: '#7d5f26', line: '#d9cba5' },
  night: { bg: '#0b1520', ink: '#f3ecdc', soft: '#b9b2a2', gold: '#d4b06a', line: '#3a4654' },
} as const

/** رمز الشهادة: NAF-XXXX-XXXX بلا أحرف ملتبسة */
export function certCode(rand: (n: number) => number) {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const part = () => Array.from({ length: 4 }, () => A[rand(A.length)]).join('')
  return `NAF-${part()}-${part()}`
}

export type Criterion = { key: string; label: string; met: boolean; detail: string }

/** تقييم الشروط — دالة نقية: تأخذ أرقام المتدرب وتعيد كل شرط ونتيجته */
export function evaluateRules(rules: CertRules, x: {
  completable: number; completed: number; sessions: number; attended: number
  quizzes: number; quizzesPassed: number; assignments: number; assignmentsAccepted: number
}): { eligible: boolean; criteria: Criterion[] } {
  const pct = (a: number, n: number) => (n ? Math.round((a / n) * 100) : 100)
  const c: Criterion[] = []
  if (x.completable) c.push({ key: 'lessons', label: `إكمال ${rules.lessonsPct}% من الدروس`, met: pct(x.completed, x.completable) >= rules.lessonsPct, detail: `${x.completed} من ${x.completable}` })
  if (x.sessions && rules.attendancePct > 0) c.push({ key: 'attendance', label: `حضور ${rules.attendancePct}% من الجلسات`, met: pct(x.attended, x.sessions) >= rules.attendancePct, detail: `${x.attended} من ${x.sessions}` })
  if (rules.quizzes && x.quizzes) c.push({ key: 'quizzes', label: 'النجاح في الاختبارات', met: x.quizzesPassed >= x.quizzes, detail: `${x.quizzesPassed} من ${x.quizzes}` })
  if (rules.assignments && x.assignments) c.push({ key: 'assignments', label: 'قبول الواجبات', met: x.assignmentsAccepted >= x.assignments, detail: `${x.assignmentsAccepted} من ${x.assignments}` })
  return { eligible: rules.enabled && c.length > 0 && c.every((k) => k.met), criteria: c }
}

/** رابط إضافة الشهادة إلى LinkedIn */
export function linkedinUrl(o: { course: string; code: string; url: string; issuedAt: string; org?: string }) {
  const d = new Date(o.issuedAt)
  const q = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME', name: o.course, organizationName: o.org ?? 'أكاديمية ناف',
    issueYear: String(d.getUTCFullYear()), issueMonth: String(d.getUTCMonth() + 1), certUrl: o.url, certId: o.code,
  })
  return `https://www.linkedin.com/profile/add?${q}`
}
