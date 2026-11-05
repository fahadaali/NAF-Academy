/* يطبّق الترحيلات ثم يبذر المحتوى المبدئي إن كانت القاعدة فارغة.
   يُشغَّل تلقائياً قبل dev وbuild. `--reset` يمسح القاعدة ويعيد البذر. */
import { mkdirSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { count } from 'drizzle-orm'
import * as s from '../src/server/db/schema'
import { corporate, courses, hero, instructors, ladder, stats, tracks } from '../src/content/seed'
import { DEFAULT_HOME } from '../src/content/home-defaults'
import { EMPTY_ASSIGNMENT, EMPTY_QUIZ, type Quiz } from '../src/lib/learning-types'

const url = process.env.DATABASE_URL ?? 'file:.data/academy.db'
if (url.startsWith('file:')) {
  mkdirSync('.data/media', { recursive: true })
  if (process.argv.includes('--reset')) rmSync(url.slice(5), { force: true })
}

const db = drizzle(createClient({ url }), { schema: s })
await migrate(db, { migrationsFolder: './migrations' })

const [{ n }] = await db.select({ n: count() }).from(s.tracks)
if (n > 0) {
  console.log('db: ready')
  process.exit(0)
}

const token = () => randomUUID().replace(/-/g, '')
const trackId = new Map<string, string>()
for (const [i, t] of tracks.entries()) {
  const id = randomUUID()
  trackId.set(t.slug, id)
  await db.insert(s.tracks).values({
    id, slug: t.slug, title: t.title, kicker: t.kicker, summary: t.summary, tone: t.tone, glyph: t.glyph, sortOrder: i,
    description: `${t.summary} مسار متدرّج من الممارسة إلى الخبرة، بدورات مباشرة وحضورية ومسجّلة.`,
  })
}

const instId = new Map<string, string>()
for (const [i, p] of instructors.entries()) {
  const id = randomUUID()
  instId.set(p.slug, id)
  await db.insert(s.instructors).values({
    id, slug: `instructor-${i + 1}`, name: p.name, title: p.title, highlights: p.highlights, display: p.display,
    featured: !!p.featured, sortOrder: i,
    bio: 'نبذة المدرب تُضاف من لوحة الإدارة: الخبرات، والمؤهلات، والقطاعات التي عمل فيها.',
  })
}

const demoModules = [
  { title: 'الأساس النظامي', lessons: [['مدخل وتعريفات', 'video', 18, true], ['قراءة النص وتفكيكه', 'video', 26, false], ['ملخص الوحدة', 'file', 0, false]] },
  { title: 'التطبيق العملي', lessons: [['حالات عملية', 'live', 90, false], ['تمرين الصياغة', 'assignment', 45, false]] },
  { title: 'التقييم', lessons: [['الاختبار النهائي', 'quiz', 30, false]] },
] as const

/* محتوى تجريبي للدروس — يُستبدل من محرّر الدرس في اللوحة */
const demoQuiz: Quiz = {
  ...EMPTY_QUIZ,
  questions: [
    { id: 'q1', kind: 'single', prompt: 'ما الأصل في عبء الإثبات؟', options: [{ id: 'a', text: 'على المدّعي' }, { id: 'b', text: 'على المدّعى عليه' }, { id: 'c', text: 'على المحكمة' }], correct: ['a'], explanation: 'البيّنة على من ادّعى.' },
    { id: 'q2', kind: 'truefalse', prompt: 'الإقرار حجة قاصرة على المُقِرّ.', options: [{ id: 't', text: 'صح' }, { id: 'f', text: 'خطأ' }], correct: ['t'] },
    { id: 'q3', kind: 'multi', prompt: 'أيّ مما يلي من طرق الإثبات؟', options: [{ id: 'a', text: 'الكتابة' }, { id: 'b', text: 'الشهادة' }, { id: 'c', text: 'الإشاعة' }], correct: ['a', 'b'] },
  ],
}
function demoLesson(type: string, startsAt: string | null, minutes: number) {
  if (type === 'quiz') return { quiz: demoQuiz, body: 'اختبار قصير يقيس فهمك لمحاور الدورة.' }
  if (type === 'assignment') return { assignment: { ...EMPTY_ASSIGNMENT, instructions: 'صُغ بنداً تعاقدياً وفق ما تعلّمته، وارفع الملف هنا ليراجعه المدرب.' } }
  if (type === 'live' && startsAt) return { startsAt, endsAt: new Date(Date.parse(startsAt) + minutes * 60_000).toISOString() }
  if (type === 'video') return { body: 'ملخص الدرس ونقاطه الرئيسية تُكتب من محرّر الدرس في اللوحة.' }
  return { body: 'محتوى الدرس يُكتب من اللوحة.' }
}

for (const [i, c] of courses.entries()) {
  const id = randomUUID()
  await db.insert(s.courses).values({
    id, slug: c.slug, title: c.title, trackId: trackId.get(c.track), level: c.level, mode: c.mode, status: c.status,
    startsAt: c.startsAt ?? null, hours: c.hours, seatsTotal: c.seats?.total ?? null, seatsTaken: c.seats?.taken ?? 0,
    city: c.city ?? '', price: c.pricing.amount, compareAt: c.pricing.compareAt ?? null, saleEndsAt: c.pricing.saleEndsAt ?? null,
    sortOrder: i, previewToken: token(), featured: i < 3,
    subtitle: 'دورة تطبيقية تنقلك من فهم النص إلى ممارسته بثقة.',
    description: 'وصف الدورة يُكتب من لوحة الإدارة.\n\n## ماذا ستتعلم\nمحاور الدورة وتسلسلها، وأسلوب التدريب القائم على الحالات العملية.',
    outcomes: ['تحليل النصوص النظامية ذات الصلة', 'تطبيق الإجراءات على حالات واقعية', 'صياغة المستندات بثقة ودقة', 'تجنّب الأخطاء الشائعة في الممارسة'],
    audience: ['المحامون والمتدربون', 'أعضاء الإدارات القانونية', 'المستشارون في القطاع الخاص'],
    requirements: ['معرفة أساسية بالأنظمة السعودية'],
    faq: [
      { q: 'هل أحصل على شهادة؟', a: 'نعم، شهادة إتمام موثّقة برمز تحقق عند استيفاء متطلبات الدورة.' },
      { q: 'هل تتوفر تسجيلات للجلسات؟', a: 'تُتاح تسجيلات الجلسات المباشرة للمسجّلين بعد انتهائها.' },
    ],
  })
  await db.insert(s.courseInstructors).values({ courseId: id, instructorId: instId.get(c.instructor)!, sortOrder: 0 })
  if (i === 0) {
    await db.insert(s.priceTiers).values([
      { id: randomUUID(), courseId: id, name: 'الأساسية', description: 'الجلسات المباشرة وتسجيلاتها', price: 249000, compareAt: 349000, features: ['12 ساعة مباشرة', 'تسجيلات الجلسات', 'شهادة إتمام'], sortOrder: 0 },
      { id: randomUUID(), courseId: id, name: 'المميزة', description: 'مع مراجعة شخصية لعقدك', price: 349000, compareAt: 449000, features: ['كل ما في الأساسية', 'جلسة خاصة 45 دقيقة', 'مراجعة عقد من عملك'], highlight: true, capacity: 10, sortOrder: 1 },
    ])
    await db.insert(s.groupRules).values([{ id: randomUUID(), courseId: id, minQty: 3, percent: 10 }, { id: randomUUID(), courseId: id, minQty: 5, percent: 15 }])
  }
  for (const [mi, m] of demoModules.entries()) {
    const mid = randomUUID()
    await db.insert(s.modules).values({ id: mid, courseId: id, title: m.title, sortOrder: mi })
    for (const [li, [title, type, minutes, preview]] of m.lessons.entries()) {
      await db.insert(s.lessons).values({ id: randomUUID(), moduleId: mid, title, type, minutes, preview, sortOrder: li, ...demoLesson(type, c.startsAt ?? null, minutes) })
    }
  }
}

await db.insert(s.coupons).values({ id: randomUUID(), code: 'WELCOME10', label: 'ترحيب — كوبون تجريبي', kind: 'percent', value: 10, maxPerLearner: 1, stackWithSale: true })
await db.insert(s.settings).values({ key: 'home', value: { ...DEFAULT_HOME, hero, ladder, stats, corporate } })
await db.insert(s.auditLog).values({ actor: 'system', action: 'seed', entity: 'site', entityId: '-', summary: 'بذر المحتوى المبدئي' })
console.log(`db: seeded ${tracks.length} tracks, ${courses.length} courses, ${instructors.length} instructors`)
