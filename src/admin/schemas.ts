/* مخططات التحقق — مشتركة بين المحرّر (رسائل الخطأ) والخادم (الحماية). */
import { z } from 'zod'
import { COURSE_STATUS, DELIVERY, LESSON_TYPE, LEVEL, TONES } from '@/lib/enums'
import { DEFAULT_RULES } from '@/lib/certificate'
import { SCENES } from '@/content/home-defaults'

const slug = z
  .string()
  .trim()
  .min(2, 'الرابط قصير')
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'حروف إنجليزية صغيرة وأرقام وشرطات فقط')
const iso = z.string().datetime({ offset: true }).nullable()
const text = (max = 300) => z.string().trim().max(max)
const lines = z.array(text(300)).transform((a) => a.filter(Boolean)).pipe(z.array(z.string()).max(30))
const halalas = z.number().int().min(0).max(100_000_000)

const videoInput = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('stream'), uid: z.string().trim().regex(/^[a-f0-9]{32}$/, 'معرّف Stream من 32 حرفاً') }),
  z.object({ provider: z.literal('url'), url: z.string().trim().url('رابط فيديو غير صالح').regex(/^https:\/\//, 'رابط https فقط').max(1000) }),
  z.object({ provider: z.literal('none') }),
])
const optionInput = z.object({ id: z.string().min(1).max(40), text: z.string().trim().min(1, 'نص الخيار مطلوب').max(500) })
const quizQuestion = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(['single', 'multi', 'truefalse', 'case']),
  prompt: z.string().trim().min(1, 'نص السؤال مطلوب').max(2000),
  caseText: z.string().max(8000).optional(),
  options: z.array(optionInput).min(2, 'خياران على الأقل').max(10),
  correct: z.array(z.string()).min(1, 'حدّد الإجابة الصحيحة'),
  explanation: z.string().max(2000).optional(),
  points: z.number().int().min(1).max(100).optional(),
}).refine((q) => q.correct.every((c) => q.options.some((o) => o.id === c)), { message: 'الإجابة الصحيحة ليست من الخيارات', path: ['correct'] })
  .refine((q) => q.kind === 'multi' || q.correct.length === 1, { message: 'إجابة صحيحة واحدة لهذا النوع', path: ['correct'] })
export const certRulesInput = z.object({
  enabled: z.boolean(),
  lessonsPct: z.number().int().min(0).max(100),
  attendancePct: z.number().int().min(0).max(100),
  quizzes: z.boolean(),
  assignments: z.boolean(),
  autoApprove: z.boolean(),
  templateId: z.string().nullable(),
})
export const quizInput = z.object({
  passPct: z.number().int().min(1).max(100),
  attempts: z.number().int().min(1).max(50).nullable(),
  timeLimitMin: z.number().int().min(1).max(600).nullable(),
  shuffle: z.boolean(),
  showAnswers: z.boolean(),
  questions: z.array(quizQuestion).max(200),
})
export const assignmentInput = z.object({
  instructions: z.string().max(10_000),
  maxSizeMb: z.number().int().min(1).max(25),
  accept: z.array(z.string().regex(/^[a-z0-9]{2,5}$/)).min(1).max(10),
  dueDays: z.number().int().min(1).max(365).nullable(),
})

const line = (max = 4000) => z.string().max(max)
export const blockInput = z.discriminatedUnion('t', [
  z.object({ t: z.literal('p'), text: line() }),
  z.object({ t: z.literal('h'), text: line(200) }),
  z.object({ t: z.literal('ul'), items: z.array(line(1000)).max(50) }),
  z.object({ t: z.literal('ol'), items: z.array(line(1000)).max(50) }),
  z.object({ t: z.literal('quote'), text: line(), cite: line(200) }),
  z.object({ t: z.literal('note'), text: line(), tone: z.enum(['info', 'gold']) }),
  z.object({ t: z.literal('img'), mediaId: z.string().max(60), caption: line(300) }),
  z.object({ t: z.literal('video'), url: z.union([z.literal(''), z.string().trim().url('رابط فيديو غير صالح').regex(/^https:\/\//, 'رابط https فقط').max(1000)]), caption: line(300) }),
  z.object({ t: z.literal('hr') }),
])

export const lessonInput = z.object({
  id: z.string().optional(),
  title: text(200).min(1, 'عنوان الدرس مطلوب'),
  type: z.enum(LESSON_TYPE),
  minutes: z.number().int().min(0).max(10_000),
  preview: z.boolean(),
  video: videoInput.default({ provider: 'none' }),
  chapters: z.array(z.object({ at: z.number().int().min(0), title: z.string().trim().min(1).max(160) })).max(100).default([]),
  body: z.string().max(50_000).default(''),
  attachments: z.array(z.object({ assetId: z.string(), name: z.string().max(200), size: z.number().int() })).max(30).default([]),
  quiz: quizInput.nullable().default(null),
  assignment: assignmentInput.nullable().default(null),
  drip: z.object({ mode: z.enum(['none', 'date', 'days']), date: iso, days: z.number().int().min(0).max(3650).nullable() }).default({ mode: 'none', date: null, days: null }),
  startsAt: iso.default(null),
  endsAt: iso.default(null),
  joinUrl: z.union([z.literal(''), z.string().trim().url('رابط غير صالح').regex(/^https:\/\//, 'رابط https فقط').max(1000)]).default(''),
  location: z.string().max(1000).default(''),
  recording: videoInput.nullable().default(null),
  captions: z.array(z.object({ lang: z.string().regex(/^[a-z]{2}$/), label: z.string().trim().min(1).max(40), assetId: z.string().uuid() })).max(6).default([]),
})

export const moduleInput = z.object({
  id: z.string().optional(),
  title: text(200).min(1, 'عنوان الوحدة مطلوب'),
  lessons: z.array(lessonInput).max(100),
})

export const tierInput = z.object({
  id: z.string().optional(),
  name: text(80).min(1, 'اسم الباقة مطلوب'),
  description: text(300),
  price: halalas,
  compareAt: halalas.nullable(),
  features: lines,
  highlight: z.boolean(),
  capacity: z.number().int().min(1).max(100_000).nullable(),
})
export const groupRuleInput = z.object({ minQty: z.number().int().min(2).max(50), percent: z.number().int().min(1).max(90) })

export const courseInput = z
  .object({
    slug,
    title: text(160).min(3, 'العنوان مطلوب'),
    subtitle: text(300),
    trackId: z.string().nullable(),
    level: z.enum(LEVEL),
    mode: z.enum(DELIVERY),
    status: z.enum(COURSE_STATUS),
    publishAt: iso,
    startsAt: iso,
    endsAt: iso,
    hours: z.number().min(0).max(1000),
    seatsTotal: z.number().int().min(1).max(100_000).nullable(),
    seatsTaken: z.number().int().min(0).max(100_000),
    city: text(80),
    venue: text(300),
    venueMapUrl: z.union([z.literal(''), z.string().url('رابط غير صالح').max(500)]),
    coverId: z.string().nullable(),
    price: halalas,
    compareAt: halalas.nullable(),
    saleStartsAt: iso.default(null),
    saleEndsAt: iso,
    free: z.boolean(),
    accessDays: z.number().int().min(1, 'يوم واحد على الأقل').max(3650).nullable().default(null),
    teaser: videoInput.default({ provider: 'none' }),
    description: text(20_000),
    content: z.array(blockInput).max(200).nullable().default(null),
    outcomes: lines,
    audience: lines,
    requirements: lines,
    faq: z.array(z.object({ q: text(300), a: text(2000) })).transform((a) => a.filter((f) => f.q && f.a)),
    featured: z.boolean(),
    sequential: z.boolean().default(false),
    completeAt: z.number().int().min(50).max(100).default(90),
    certificate: certRulesInput.default(DEFAULT_RULES),
    seoTitle: text(120),
    seoDescription: text(300),
    instructorIds: z.array(z.string()).max(12),
    curriculum: z.array(moduleInput).max(50),
    tiers: z.array(tierInput).max(6),
    groupRules: z.array(groupRuleInput).max(6),
  })
  .superRefine((v, ctx) => {
    if (v.compareAt !== null && !v.free && v.compareAt <= v.price)
      ctx.addIssue({ code: 'custom', path: ['compareAt'], message: 'السعر قبل العرض يجب أن يكون أعلى من الحالي' })
    if (v.saleStartsAt && v.saleEndsAt && Date.parse(v.saleStartsAt) >= Date.parse(v.saleEndsAt))
      ctx.addIssue({ code: 'custom', path: ['saleEndsAt'], message: 'نهاية العرض بعد بدايته' })
    if (v.status === 'scheduled' && !v.publishAt)
      ctx.addIssue({ code: 'custom', path: ['publishAt'], message: 'حدّد موعد النشر للدورة المجدولة' })
    if (v.endsAt && v.startsAt && v.endsAt < v.startsAt)
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'النهاية قبل البداية' })
    v.tiers.forEach((t, i) => {
      if (t.compareAt !== null && t.compareAt <= t.price) ctx.addIssue({ code: 'custom', path: ['tiers', i, 'compareAt'], message: 'السعر قبل العرض أعلى من سعر الباقة' })
    })
    if (new Set(v.groupRules.map((g) => g.minQty)).size !== v.groupRules.length)
      ctx.addIssue({ code: 'custom', path: ['groupRules'], message: 'لا تكرّر عدد المقاعد في قاعدتين' })
    if (v.seatsTotal !== null && v.seatsTaken > v.seatsTotal)
      ctx.addIssue({ code: 'custom', path: ['seatsTaken'], message: 'المحجوز أكثر من السعة' })
  })
export type CourseInput = z.input<typeof courseInput>

export const trackInput = z.object({
  slug,
  title: text(120).min(2, 'العنوان مطلوب'),
  kicker: text(60),
  summary: text(200),
  description: text(5000),
  tone: z.enum(TONES),
  glyph: text(3),
  coverId: z.string().nullable(),
  visible: z.boolean(),
})
export type TrackInput = z.input<typeof trackInput>

export const instructorInput = z.object({
  slug,
  name: text(120).min(2, 'الاسم مطلوب'),
  title: text(160),
  bio: text(5000),
  highlights: lines,
  links: z.array(z.object({ label: text(60), url: z.string().url('رابط غير صالح').max(500) })).max(10),
  photoId: z.string().nullable(),
  sceneId: z.string().nullable().default(null),
  display: z.enum(['full', 'compact', 'hidden']),
  featured: z.boolean(),
})
export type InstructorInput = z.input<typeof instructorInput>

export type Errors = Record<string, string>
export type Result = { ok: true; id: string } | { ok: false; errors: Errors; message?: string; /** يحتاج تأكيداً صريحاً ثم إعادة الإرسال */ confirm?: string }

/** أخطاء zod ← خريطة مسار ← رسالة */
export function errorsOf(e: z.ZodError): Errors {
  const out: Errors = {}
  for (const i of e.issues) {
    const k = i.path.join('.')
    if (!out[k]) out[k] = i.message
  }
  return out
}

/* محتوى الرئيسية */
const t = (max: number) => z.string().max(max)
export const homeInput = z.object({
  hero: z.object({
    eyebrow: t(80), lines: z.array(t(60)).min(1, 'سطر واحد على الأقل').max(5),
    phases: z.array(z.object({ at: z.number().min(0).max(1), text: t(120) })).max(4),
    cta: z.object({ label: t(40), href: z.string().max(200).regex(/^(\/|#|https:\/\/)/, 'رابط يبدأ بـ / أو # أو https') }),
  }),
  ladder: z.object({
    title: t(80),
    steps: z.array(z.object({ level: z.enum(LEVEL), name: t(40), title: t(40), body: t(400), gains: z.array(t(120)).max(8) })).length(3),
  }),
  stats: z.array(z.object({ value: z.number().min(0).max(1e9), suffix: t(6).optional(), label: t(60) })).max(8),
  corporate: z.object({ title: t(120), body: t(600), sizes: z.array(t(20)).max(8), interests: z.array(t(40)).max(12) }),
  sections: z.array(z.object({ key: z.enum(SCENES), visible: z.boolean(), menu: t(30).optional() })).length(SCENES.length),
  voices: z.array(z.object({ quote: t(600).min(1, 'نص الرأي مطلوب'), name: t(80).min(1, 'الاسم مطلوب'), role: t(120), photoId: z.string().nullable() })).max(12).default([]),
  partners: z.array(z.object({ name: t(80).min(1, 'اسم الجهة مطلوب'), logoId: z.string().nullable(), url: z.string().max(300).regex(/^$|^https:\/\//, 'رابط يبدأ بـ https') })).max(24).default([]),
  faq: z.array(z.object({ q: t(200).min(1, 'السؤال مطلوب'), a: t(1500).min(1, 'الجواب مطلوب') })).max(20).default([]),
  heads: z.record(z.string(), z.object({ eyebrow: t(60), title: t(160) })),
  footer: z.object({ title: t(120), cta: t(40) }),
})

/* محتوى الصفحات العامة */
const head = z.object({ eyebrow: t(60), title: t(160).min(1, 'العنوان مطلوب'), body: t(400) })
export const pagesInput = z.object({
  site: z.object({ title: t(120).min(3, 'عنوان الموقع مطلوب'), description: t(300).min(10, 'وصف قصير للموقع مطلوب') }),
  home: z.object({ seoDescription: t(300) }),
  courses: head.extend({ seoDescription: t(300) }),
  tracks: head.extend({ seoDescription: t(300) }),
  login: head,
  policies: head.extend({ terms: t(20000), privacy: t(20000) }),
})

/* ───────── الدفعات ───────── */
const httpsUrl = z.union([z.literal(''), z.string().trim().url('رابط غير صالح').regex(/^https:\/\//, 'رابط https فقط').max(1000)])

const sessionInput = z.object({ lessonId: z.string().uuid(), startsAt: iso, endsAt: iso, joinUrl: httpsUrl, location: z.string().trim().max(1000), recording: z.string().trim().max(1000).default('') })
  .refine((x) => !x.startsAt || !x.endsAt || Date.parse(x.endsAt) > Date.parse(x.startsAt), { message: 'النهاية بعد البداية', path: ['endsAt'] })
export const cohortInput = z.object({
  title: z.string().trim().min(2, 'اسم الدفعة مطلوب').max(120),
  status: z.enum(['soon', 'open', 'closed']),
  startsAt: iso,
  endsAt: iso,
  seatsTotal: z.number().int().min(1).max(100_000).nullable(),
  seatsTaken: z.number().int().min(0).max(100_000),
  city: z.string().trim().max(80),
  venue: z.string().trim().max(300),
  sessions: z.array(sessionInput).max(300),
}).refine((x) => !x.startsAt || !x.endsAt || Date.parse(x.endsAt) > Date.parse(x.startsAt), { message: 'نهاية الدفعة بعد بدايتها', path: ['endsAt'] })
export type CohortInput = z.input<typeof cohortInput>

/* ───────── العروض العامة ───────── */
export const promotionInput = z.object({
  label: z.string().trim().min(2, 'اسم العرض مطلوب — يظهر بجوار السعر').max(60),
  scope: z.enum(['all', 'tracks', 'courses']),
  trackIds: z.array(z.string().uuid()).max(100),
  courseIds: z.array(z.string().uuid()).max(500),
  kind: z.enum(['percent', 'amount']),
  value: z.number().int().min(1),
  startsAt: iso,
  endsAt: iso,
  active: z.boolean(),
}).superRefine((v, ctx) => {
  if (v.kind === 'percent' && v.value > 90) ctx.addIssue({ code: 'custom', path: ['value'], message: 'النسبة حتى 90%' })
  if (v.kind === 'amount' && v.value > 100_000_000) ctx.addIssue({ code: 'custom', path: ['value'], message: 'مبلغ كبير جداً' })
  if (v.scope === 'tracks' && !v.trackIds.length) ctx.addIssue({ code: 'custom', path: ['trackIds'], message: 'اختر مساراً واحداً على الأقل' })
  if (v.scope === 'courses' && !v.courseIds.length) ctx.addIssue({ code: 'custom', path: ['courseIds'], message: 'اختر دورة واحدة على الأقل' })
  if (v.startsAt && v.endsAt && Date.parse(v.startsAt) >= Date.parse(v.endsAt)) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'النهاية بعد البداية' })
})
export type PromotionInput = z.input<typeof promotionInput>

/* ───────── مسودة المعاينة ───────── */
export const courseDraftInput = z.object({
  title: z.string().max(160),
  subtitle: z.string().max(300),
  coverId: z.string().nullable(),
  content: z.array(blockInput).max(200).nullable(),
  outcomes: z.array(z.string().max(300)).max(30),
  audience: z.array(z.string().max(300)).max(30),
  requirements: z.array(z.string().max(300)).max(30),
  faq: z.array(z.object({ q: z.string().max(300), a: z.string().max(2000) })).max(50),
})
export type CourseDraft = z.infer<typeof courseDraftInput>

/* ───────── عقود المؤسسات ───────── */
export const contractInput = z.object({
  number: z.string().trim().max(60),
  title: z.string().trim().min(2, 'عنوان العقد مطلوب').max(160),
  status: z.enum(['draft', 'active', 'expired', 'cancelled']),
  startsAt: iso,
  endsAt: iso,
  seats: z.number().int().min(1, 'مقعد واحد على الأقل').max(100_000),
  scope: z.enum(['all', 'courses']),
  courseIds: z.array(z.string().uuid()).max(500),
  total: halalas,
  fileId: z.string().uuid().nullable(),
  notes: z.string().trim().max(4000),
}).superRefine((v, ctx) => {
  if (v.scope === 'courses' && !v.courseIds.length) ctx.addIssue({ code: 'custom', path: ['courseIds'], message: 'اختر دورة واحدة على الأقل' })
  if (v.startsAt && v.endsAt && Date.parse(v.startsAt) >= Date.parse(v.endsAt)) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'نهاية العقد بعد بدايته' })
})
export type ContractInput = z.input<typeof contractInput>
