import 'server-only'
/* طبقة القراءة للواجهة العامة — تحوّل صفوف القاعدة إلى نماذج العرض في content/types. */
import { and, asc, count, desc, eq, inArray, isNull } from 'drizzle-orm'
import { db, schema as s } from './db'
import { getSetting } from './settings'
import type { CohortView, Course, Instructor, MediaView, Pricing, Promo, Track } from '@/content/types'
import { DEFAULT_HOME, DEFAULT_MENU, SCENES, type HomeContent } from '@/content/home-defaults'
import { mergePages, type PagesContent } from '@/content/pages-defaults'
import { corporate as seedCorporate, hero as seedHero, ladder as seedLadder, stats as seedStats } from '@/content/seed'
import { isPublic, liveStatus, publicOrder } from '@/lib/course-meta'
import { priceView } from '@/lib/pricing'
import { cohortState, leadCohort, statusWithCohorts, type CohortLite } from '@/lib/cohorts'
import { cohortsOf, inviteHolds } from './cohorts'
import { livePromotions, promosFor } from './promotions'
import type { CourseRow, InstructorRow, LessonRow, Media, ModuleRow, TierRow, TrackRow } from './db/schema'
import { inList } from '@/server/db/limits'
import { blocksFrom, type Block } from '@/lib/blocks'

const mediaUrl = (m: Pick<Media, 'key'>) => `/media/${m.key}`

function mediaView(m: Media | undefined | null): MediaView | undefined {
  if (!m || m.deletedAt) return undefined
  return { url: mediaUrl(m), alt: m.alt, x: m.focalX, y: m.focalY, w: m.width, h: m.height }
}

async function mediaMap(ids: (string | null | undefined)[]) {
  const list = ids.filter((x): x is string => !!x)
  if (!list.length) return new Map<string, Media>()
  const rows = await db.select().from(s.media).where(inList(s.media.id, list))
  return new Map(rows.map((r) => [r.id, r]))
}

const toTrack = (t: TrackRow, count: number, m: Map<string, Media>): Track => ({
  slug: t.slug, title: t.title, kicker: t.kicker, summary: t.summary, description: t.description,
  tone: t.tone, glyph: t.glyph, courseCount: count, cover: mediaView(m.get(t.coverId ?? '')),
})

const toInstructor = (p: InstructorRow, m: Map<string, Media>): Instructor => ({
  slug: p.slug, name: p.name, title: p.title, highlights: p.highlights, display: p.display, featured: p.featured,
  bio: p.bio, links: p.links, photo: mediaView(m.get(p.photoId ?? '')), scene: mediaView(m.get(p.sceneId ?? '')),
})

const seatsOf = (total: number | null, taken: number) => (total ? { total, taken: Math.min(taken, total) } : undefined)

const cohortView = (k: CohortLite & { row?: { venue: string } }, now: Date): CohortView => ({
  id: k.id, title: k.title, state: cohortState(k, now), startsAt: k.startsAt ?? undefined, endsAt: k.endsAt ?? undefined,
  seats: seatsOf(k.seatsTotal, k.taken), city: k.city || undefined,
  /* أول سطر من مقرّ الدفعة — التفاصيل لمسجّليها في صفحة الدرس والتذكير */
  venue: k.row?.venue.split('\n')[0] || undefined,
})

function toCourse(c: CourseRow, trackSlug: string, inst: string[], m: Map<string, Media>, now: Date, booked = 0, tiers: TierRow[] = [], promos: Promo[] = [], cohorts: CohortLite[] = []): Course {
  /* بدفعات: المقاعد والموعد والمدينة من الدفعة الممثّلة، والحالة من أفضل الدفعات */
  const lead = cohorts.length ? leadCohort(cohorts, now) : undefined
  const seats = cohorts.length ? (lead ? seatsOf(lead.seatsTotal, lead.taken) : undefined) : seatsOf(c.seatsTotal, c.seatsTaken + booked)
  const base = liveStatus(c.status, c.publishAt, cohorts.length ? undefined : seats, now)
  return {
    slug: c.slug, title: c.title, subtitle: c.subtitle, track: trackSlug, level: c.level, mode: c.mode,
    status: statusWithCohorts(base, cohorts, now),
    startsAt: (lead ? lead.startsAt : c.startsAt) ?? undefined, hours: c.hours, city: (lead?.city || c.city) || undefined, seats, featured: c.featured, order: c.sortOrder,
    pricing: tiers.length ? cheapestTier(tiers, c, now, promos) : coursePricing(c, promos),
    instructor: inst[0] ?? '', instructors: inst, cover: mediaView(m.get(c.coverId ?? '')),
    cohorts: cohorts.length ? cohorts.map((k) => cohortView(k, now)).filter((k) => k.state !== 'closed' || !k.endsAt || Date.parse(k.endsAt) > now.getTime() - 30 * 864e5) : undefined,
    accessDays: c.accessDays ?? undefined,
  }
}

/** سعر الدورة كما يُدفع الآن: عرضها في نافذته والعروض العامة المنطبقة */
const coursePricing = (c: Pick<CourseRow, 'price' | 'compareAt' | 'saleStartsAt' | 'saleEndsAt' | 'free'>, promos: Promo[] = []): Pricing =>
  ({ amount: c.price, compareAt: c.compareAt ?? undefined, saleStartsAt: c.saleStartsAt ?? undefined, saleEndsAt: c.saleEndsAt ?? undefined, free: c.free, promos })

/** سعر الباقة كما يُدفع الآن — بنافذة عرض الدورة نفسها والعروض العامة (كما يحسبه الخادم عند الدفع) */
const tierPricing = (t: Pick<TierRow, 'price' | 'compareAt'>, c: Pick<CourseRow, 'saleStartsAt' | 'saleEndsAt'>, promos: Promo[] = []): Pricing =>
  ({ amount: t.price, compareAt: t.compareAt ?? undefined, saleStartsAt: c.saleStartsAt ?? undefined, saleEndsAt: c.saleEndsAt ?? undefined, promos })

/** بطاقة دورة لها باقات: أرخص باقة الآن «من …» */
function cheapestTier(tiers: TierRow[], c: CourseRow, now: Date, promos: Promo[]): Pricing {
  const best = tiers.map((t) => tierPricing(t, c, promos)).sort((a, b) => priceView(a, now).current - priceView(b, now).current)[0]
  return { ...best, from: tiers.length > 1 }
}

/** صور بمعرّفاتها كما تعرضها الواجهة (المحذوف لا يُعرض) — لمشاهد الرئيسية التي تحفظ معرّفات */
export async function mediaViews(ids: (string | null | undefined)[]): Promise<Map<string, MediaView>> {
  const m = await mediaMap(ids)
  const out = new Map<string, MediaView>()
  for (const [id, row] of m) { const v = mediaView(row); if (v) out.set(id, v) }
  return out
}

/** كل ما تحتاجه الواجهة العامة دفعة واحدة */
export async function catalog(now = new Date()) {
  const [trackRows, courseRows, instRows, links, enrolled, granted, tierRows, invited] = await Promise.all([
    db.select().from(s.tracks).where(isNull(s.tracks.deletedAt)).orderBy(asc(s.tracks.sortOrder)),
    db.select().from(s.courses).where(isNull(s.courses.deletedAt)).orderBy(asc(s.courses.sortOrder)),
    db.select().from(s.instructors).where(isNull(s.instructors.deletedAt)).orderBy(asc(s.instructors.sortOrder)),
    db.select().from(s.courseInstructors).orderBy(asc(s.courseInstructors.sortOrder)),
    db.select({ courseId: s.enrollments.courseId, n: count() }).from(s.enrollments).where(eq(s.enrollments.status, 'active')).groupBy(s.enrollments.courseId),
    db.select({ courseId: s.seatGrants.courseId, n: count() }).from(s.seatGrants).innerJoin(s.orders, eq(s.orders.id, s.seatGrants.orderId))
      .where(and(isNull(s.seatGrants.enrollmentId), inArray(s.orders.status, ['paid', 'partially_refunded']))).groupBy(s.seatGrants.courseId),
    db.select().from(s.priceTiers).orderBy(asc(s.priceTiers.sortOrder)),
    db.select({ courseId: s.invitations.courseId, n: count() }).from(s.invitations).where(inviteHolds()).groupBy(s.invitations.courseId),
  ])
  const [promoRows, cohortMap] = await Promise.all([livePromotions(now), cohortsOf(courseRows.map((c) => c.id))])
  const booked = new Map<string, number>()
  for (const r of [...enrolled, ...granted, ...invited]) booked.set(r.courseId, (booked.get(r.courseId) ?? 0) + r.n)
  const m = await mediaMap([...trackRows.map((t) => t.coverId), ...courseRows.map((c) => c.coverId), ...instRows.flatMap((p) => [p.photoId, p.sceneId])])
  const trackSlug = new Map(trackRows.map((t) => [t.id, t.slug]))
  const instSlug = new Map(instRows.map((p) => [p.id, p.slug]))
  const byCourse = new Map<string, string[]>()
  for (const l of links) {
    const slug = instSlug.get(l.instructorId)
    if (slug) byCourse.set(l.courseId, [...(byCourse.get(l.courseId) ?? []), slug])
  }
  const all = courseRows.map((c) => {
    const promos = promosFor(c, promoRows)
    return { row: c, promos, view: toCourse(c, trackSlug.get(c.trackId ?? '') ?? '', byCourse.get(c.id) ?? [], m, now, booked.get(c.id) ?? 0, tierRows.filter((t) => t.courseId === c.id), promos, cohortMap.get(c.id) ?? []) }
  })
  /* الخاصة (برامج الجامعات والتدريب التعاوني) خارج الكتالوج والمسارات والرئيسية وخريطة الموقع */
  const courses = all.filter((x) => x.row.visibility === 'public').map((x) => x.view).filter((c) => isPublic(c.status)).sort(publicOrder)
  const visibleTracks = trackRows.filter((t) => t.visible)
  const tracks = visibleTracks.map((t) => toTrack(t, courses.filter((c) => c.track === t.slug).length, m))
  const instructors = instRows.map((p) => toInstructor(p, m))
  return { tracks, courses, instructors, rows: all }
}

/** مشهد أُضيف إلى المنصة بعد حفظ ترتيب الرئيسية: يُلحق قبل «للمؤسسات» (أو في آخرها) — ويغيب ما دام محتواه فارغاً */
function withNewScenes(saved: HomeContent['sections']): HomeContent['sections'] {
  const have = new Set(saved.map((x) => x.key))
  const known = saved.filter((x) => (SCENES as readonly string[]).includes(x.key))
  const missing = SCENES.filter((k) => !have.has(k)).map((key) => ({ key, visible: true, menu: DEFAULT_MENU[key] }))
  const at = known.findIndex((x) => x.key === 'corporate')
  return at < 0 ? [...known, ...missing] : [...known.slice(0, at), ...missing, ...known.slice(at)]
}

export async function homeContent(): Promise<HomeContent> {
  const [row] = await db.select().from(s.settings).where(eq(s.settings.key, 'home'))
  const v = (row?.value ?? {}) as Partial<HomeContent>
  /* قاعدة فارغة (أول نشر) تُعرض بالمحتوى المبدئي بدل أن تنكسر */
  return {
    hero: seedHero, ladder: seedLadder, stats: seedStats, corporate: seedCorporate, ...DEFAULT_HOME, ...v,
    heads: { ...DEFAULT_HOME.heads, ...(v.heads ?? {}) },
    sections: withNewScenes(v.sections ?? DEFAULT_HOME.sections).map((x) => ({ ...x, menu: x.menu ?? DEFAULT_MENU[x.key] })),
  } as HomeContent
}

/** محتوى الصفحات العامة (الدورات، المسارات، الدخول، السياسات، وصف الموقع) — من اللوحة */
export async function pagesContent(): Promise<PagesContent> {
  return mergePages(await getSetting<Partial<PagesContent> | undefined>('pages', undefined))
}

export type PublicTier = { id: string; name: string; description: string; price: number; compareAt: number | null; features: string[]; highlight: boolean }

export type CourseDetail = {
  course: Course
  row: CourseRow
  tiers: PublicTier[]
  groupRules: { minQty: number; percent: number }[]
  track?: Track
  instructors: Instructor[]
  curriculum: (ModuleRow & { lessons: PublicLesson[] })[]
  related: Course[]
  /** كل المدربين — لبطاقات الدورات ذات الصلة */
  people: Instructor[]
  reviews: { avg: number; count: number; dist: number[]; items: { id: string; rating: number; comment: string; display: string; at: string }[] }
  /** الوصف كتلاً (من المحرّر الغني أو مشتقاً من النص القديم) وصوره */
  blocks: Block[]
  blockMedia: Map<string, MediaView>
}

/** الدرس كما يظهر في صفحة الدورة العامة — بلا مصدر الفيديو ومعرّف Stream والروابط ومحتوى الاختبار والواجب */
export type PublicLesson = Omit<LessonRow, 'video' | 'recording' | 'joinUrl' | 'streamUid' | 'thumbnailUrl' | 'quiz' | 'assignment' | 'attachments' | 'zoomMeetingId'>
const publicLesson = ({ video: _v, recording: _r, joinUrl: _j, streamUid: _u, thumbnailUrl: _t, quiz: _q, assignment: _a, attachments: _f, zoomMeetingId: _z, ...l }: LessonRow): PublicLesson => l

/** صفحة الدورة — المسودة والمؤرشفة والخاصة لا تظهر إلا برمز المعاينة */
export async function courseDetail(slug: string, preview?: string, now = new Date()): Promise<CourseDetail | null> {
  const { tracks, instructors, rows, courses } = await catalog(now)
  const hit = rows.find((x) => x.row.slug === slug)
  if (!hit) return null
  const visible = (hit.row.visibility === 'public' && isPublic(hit.view.status)) || (preview && preview === hit.row.previewToken)
  if (!visible) return null
  const mods = await db.select().from(s.modules).where(eq(s.modules.courseId, hit.row.id)).orderBy(asc(s.modules.sortOrder))
  const les = mods.length
    ? await db.select().from(s.lessons).where(inList(s.lessons.moduleId, mods.map((x) => x.id))).orderBy(asc(s.lessons.sortOrder))
    : []
  const tiers = await db.select().from(s.priceTiers).where(eq(s.priceTiers.courseId, hit.row.id)).orderBy(asc(s.priceTiers.sortOrder))
  const rules = await db.select().from(s.groupRules).where(eq(s.groupRules.courseId, hit.row.id))
  /* التقييمات المعتمدة فقط — الاسم كما اختاره المتدرب */
  const revs = await db.select().from(s.reviews).where(and(eq(s.reviews.courseId, hit.row.id), eq(s.reviews.status, 'approved'))).orderBy(desc(s.reviews.createdAt))
  const dist = [1, 2, 3, 4, 5].map((n) => revs.filter((r) => r.rating === n).length)
  const blocks = hit.row.content ?? blocksFrom(hit.row.description)
  const blockMedia = await mediaViews(blocks.map((b) => (b.t === 'img' ? b.mediaId : null)))
  return {
    blocks, blockMedia,
    course: hit.view,
    row: hit.row,
    tiers: tiers.map(({ id, name, description, price, compareAt, features, highlight }) => {
      const v = priceView(tierPricing({ price, compareAt }, hit.row, hit.promos), now)
      return { id, name, description, price: v.current, compareAt: v.original ?? null, features, highlight }
    }),
    groupRules: rules.map(({ minQty, percent }) => ({ minQty, percent })).sort((a, b) => a.minQty - b.minQty),
    track: tracks.find((t) => t.slug === hit.view.track),
    instructors: (hit.view.instructors ?? []).map((sl) => instructors.find((i) => i.slug === sl)).filter((x): x is Instructor => !!x),
    /* المنهج العام بلا مصادر المحتوى: لا فيديو ولا معرّف Stream ولا روابط انضمام ولا اختبارات */
    curriculum: mods.map((md) => ({ ...md, lessons: les.filter((l) => l.moduleId === md.id).map(publicLesson) })),
    related: courses.filter((c) => c.track === hit.view.track && c.slug !== slug).slice(0, 3),
    people: instructors,
    reviews: {
      avg: revs.length ? Math.round((revs.reduce((x, r) => x + r.rating, 0) / revs.length) * 10) / 10 : 0, count: revs.length, dist,
      items: revs.filter((r) => r.comment).slice(0, 12).map((r) => ({ id: r.id, rating: r.rating, comment: r.comment, display: r.display, at: r.createdAt })),
    },
  }
}

export async function trackDetail(slug: string) {
  const { tracks, courses, instructors } = await catalog()
  const track = tracks.find((t) => t.slug === slug)
  if (!track) return null
  return { track, courses: courses.filter((c) => c.track === slug), instructors }
}

export async function instructorDetail(slug: string) {
  const { instructors, courses, tracks } = await catalog()
  const person = instructors.find((p) => p.slug === slug)
  if (!person) return null
  return { person, courses: courses.filter((c) => c.instructors?.includes(slug)), tracks, instructors }
}

export async function mediaByKey(key: string) {
  const [row] = await db.select().from(s.media).where(and(eq(s.media.key, key), isNull(s.media.deletedAt)))
  return row ?? null
}
