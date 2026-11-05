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
  })
  .superRefine((v, ctx) => {
    if (v.compareAt !== null && !v.free && v.compareAt <= v.price)
      ctx.addIssue({ code: 'custom', path: ['compareAt'], message: 'السعر قبل العرض يجب أن يكون أعلى من الحالي' })
    if (v.status === 'scheduled' && !v.publishAt)
      ctx.addIssue({ code: 'custom', path: ['publishAt'], message: 'حدّد موعد النشر للدورة المجدولة' })
    if (v.endsAt && v.startsAt && v.endsAt < v.startsAt)
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'النهاية قبل البداية' })
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
