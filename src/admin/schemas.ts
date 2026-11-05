/* مخططات التحقق — مشتركة بين المحرّر (رسائل الخطأ) والخادم (الحماية). */
import { z } from 'zod'
import { COURSE_STATUS, DELIVERY, LESSON_TYPE, LEVEL, TONES } from '@/lib/enums'

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

export const lessonInput = z.object({
  id: z.string().optional(),
  title: text(200).min(1, 'عنوان الدرس مطلوب'),
  type: z.enum(LESSON_TYPE),
  minutes: z.number().int().min(0).max(10_000),
  preview: z.boolean(),
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
    saleEndsAt: iso,
    free: z.boolean(),
    description: text(20_000),
    outcomes: lines,
    audience: lines,
    requirements: lines,
    faq: z.array(z.object({ q: text(300), a: text(2000) })).transform((a) => a.filter((f) => f.q && f.a)),
    featured: z.boolean(),
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
  display: z.enum(['full', 'compact', 'hidden']),
  featured: z.boolean(),
})
export type InstructorInput = z.input<typeof instructorInput>

export type Errors = Record<string, string>
export type Result = { ok: true; id: string } | { ok: false; errors: Errors; message?: string }

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
  sections: z.array(z.object({ key: z.enum(['ladder', 'tracks', 'courses', 'instructors', 'impact', 'corporate']), visible: z.boolean() })).length(6),
  heads: z.record(z.string(), z.object({ eyebrow: t(60), title: t(160) })),
  footer: z.object({ title: t(120), cta: t(40) }),
})
