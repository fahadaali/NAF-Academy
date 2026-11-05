/* الشهادة — أنواع القالب وشروط الإصدار، مشتركة بين الخادم ومحرّر اللوحة والمعاينة.
   الصفحة A4 أفقية بنقاط PDF (842×595)، ومواضع العناصر نسب مئوية فتتطابق المعاينة وملف PDF. */

export const PAGE = { w: 842, h: 595 } as const

export type CertRules = {
  enabled: boolean
  /** نسبة الدروس القابلة للإكمال (فيديو، مقال، ملف، اختبار، واجب) */
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

export const BLOCKS = ['brand', 'title', 'lead', 'name', 'course', 'hours', 'date', 'signatures', 'qr'] as const
export type BlockKey = (typeof BLOCKS)[number]
export type Block = { x: number; y: number; size: number; show: boolean }

export type Signatory = { name: string; title: string; signatureId: string | null }

export type CertDesign = {
  tone: 'ivory' | 'night'
  backgroundId: string | null
  title: string
  lead: string
  courseLead: string
  hoursText: string
  english: boolean
  signatories: Signatory[]
  blocks: Record<BlockKey, Block>
}

export const BLOCK_LABEL: Record<BlockKey, string> = {
  brand: 'العلامة', title: 'العنوان', lead: 'التمهيد', name: 'اسم المتدرب', course: 'الدورة',
  hours: 'الساعات', date: 'التاريخ', signatures: 'التوقيعات', qr: 'رمز التحقق',
}

const b = (x: number, y: number, size: number): Block => ({ x, y, size, show: true })

export const DEFAULT_DESIGN: CertDesign = {
  tone: 'ivory',
  backgroundId: null,
  title: 'شهادة إتم~4ام',
  lead: 'تُمنح هذه الشهادة إلى',
  courseLead: 'لإتمام متطلبات دورة',
  hoursText: 'بواقع {{hours}} ساعة تدريبية',
  english: true,
  signatories: [{ name: 'مدير الأكاديمية', title: 'أكاديمية ناف', signatureId: null }],
  blocks: {
    brand: b(50, 12, 15),
    title: b(50, 26, 44),
    lead: b(50, 38, 15),
    name: b(50, 48, 36),
    course: b(50, 61, 19),
    hours: b(50, 69, 12),
    date: b(18, 86, 11),
    signatures: b(50, 85, 12),
    qr: b(84, 83, 64),
  },
}

/** دمج قالب مخزّن مع الافتراضي — عنصر جديد يأخذ موضعه الافتراضي */
export function mergeDesign(v: Partial<CertDesign> | null | undefined): CertDesign {
  const blocks = { ...DEFAULT_DESIGN.blocks }
  for (const k of BLOCKS) if (v?.blocks?.[k]) blocks[k] = { ...DEFAULT_DESIGN.blocks[k], ...v.blocks[k] }
  return { ...DEFAULT_DESIGN, ...v, blocks, signatories: v?.signatories ?? DEFAULT_DESIGN.signatories }
}

export const mergeRules = (v: Partial<CertRules> | null | undefined): CertRules => ({ ...DEFAULT_RULES, ...v })

/** ألوان الشهادة — مرآة لرموز الهوية (ملف PDF لا يقرأ متغيرات CSS) */
export const TONES = {
  ivory: { bg: '#f8f4ea', ink: '#0b1520', soft: '#4a5560', gold: '#a8823f', line: '#d9cba5' },
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
