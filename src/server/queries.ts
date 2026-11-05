import 'server-only'
/* طبقة القراءة للواجهة العامة — تحوّل صفوف القاعدة إلى نماذج العرض في content/types. */
import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm'
import { db, schema as s } from './db'
import type { Course, Instructor, MediaView, Track } from '@/content/types'
import { DEFAULT_HOME, type HomeContent } from '@/content/home-defaults'
import { isPublic, publicOrder, resolveStatus } from '@/lib/course-meta'
import type { CourseRow, InstructorRow, LessonRow, Media, ModuleRow, TrackRow } from './db/schema'

export const mediaUrl = (m: Pick<Media, 'key'>) => `/media/${m.key}`

function mediaView(m: Media | undefined | null): MediaView | undefined {
  if (!m || m.deletedAt) return undefined
  return { url: mediaUrl(m), alt: m.alt, x: m.focalX, y: m.focalY, w: m.width, h: m.height }
}

async function mediaMap(ids: (string | null | undefined)[]) {
  const list = ids.filter((x): x is string => !!x)
  if (!list.length) return new Map<string, Media>()
  const rows = await db.select().from(s.media).where(inArray(s.media.id, list))
  return new Map(rows.map((r) => [r.id, r]))
}

const toTrack = (t: TrackRow, count: number, m: Map<string, Media>): Track => ({
  slug: t.slug, title: t.title, kicker: t.kicker, summary: t.summary, description: t.description,
  tone: t.tone, glyph: t.glyph, courseCount: count, cover: mediaView(m.get(t.coverId ?? '')),
})

const toInstructor = (p: InstructorRow, m: Map<string, Media>): Instructor => ({
  slug: p.slug, name: p.name, title: p.title, highlights: p.highlights, display: p.display, featured: p.featured,
  bio: p.bio, links: p.links, photo: mediaView(m.get(p.photoId ?? '')),
})

function toCourse(c: CourseRow, trackSlug: string, inst: string[], m: Map<string, Media>, now: Date, booked = 0): Course {
  return {
    slug: c.slug, title: c.title, subtitle: c.subtitle, track: trackSlug, level: c.level, mode: c.mode,
    status: resolveStatus(c.status, c.publishAt, now),
    startsAt: c.startsAt ?? undefined, hours: c.hours, city: c.city || undefined,
    seats: c.seatsTotal ? { total: c.seatsTotal, taken: Math.min(c.seatsTaken + booked, c.seatsTotal) } : undefined,
    pricing: { amount: c.price, compareAt: c.compareAt ?? undefined, saleEndsAt: c.saleEndsAt ?? undefined, free: c.free },
    instructor: inst[0] ?? '', instructors: inst, cover: mediaView(m.get(c.coverId ?? '')),
  }
}

/** كل ما تحتاجه الواجهة العامة دفعة واحدة */
export async function catalog(now = new Date()) {
  const [trackRows, courseRows, instRows, links, enrolled, granted] = await Promise.all([
    db.select().from(s.tracks).where(isNull(s.tracks.deletedAt)).orderBy(asc(s.tracks.sortOrder)),
    db.select().from(s.courses).where(isNull(s.courses.deletedAt)).orderBy(asc(s.courses.sortOrder)),
    db.select().from(s.instructors).where(isNull(s.instructors.deletedAt)).orderBy(asc(s.instructors.sortOrder)),
    db.select().from(s.courseInstructors).orderBy(asc(s.courseInstructors.sortOrder)),
    db.select({ courseId: s.enrollments.courseId, n: count() }).from(s.enrollments).where(eq(s.enrollments.status, 'active')).groupBy(s.enrollments.courseId),
    db.select({ courseId: s.seatGrants.courseId, n: count() }).from(s.seatGrants).innerJoin(s.orders, eq(s.orders.id, s.seatGrants.orderId))
      .where(and(isNull(s.seatGrants.enrollmentId), inArray(s.orders.status, ['paid', 'partially_refunded']))).groupBy(s.seatGrants.courseId),
  ])
  const booked = new Map<string, number>()
  for (const r of [...enrolled, ...granted]) booked.set(r.courseId, (booked.get(r.courseId) ?? 0) + r.n)
  const m = await mediaMap([...trackRows.map((t) => t.coverId), ...courseRows.map((c) => c.coverId), ...instRows.map((p) => p.photoId)])
  const trackSlug = new Map(trackRows.map((t) => [t.id, t.slug]))
  const instSlug = new Map(instRows.map((p) => [p.id, p.slug]))
  const byCourse = new Map<string, string[]>()
  for (const l of links) {
    const slug = instSlug.get(l.instructorId)
    if (slug) byCourse.set(l.courseId, [...(byCourse.get(l.courseId) ?? []), slug])
  }
  const all = courseRows.map((c) => ({ row: c, view: toCourse(c, trackSlug.get(c.trackId ?? '') ?? '', byCourse.get(c.id) ?? [], m, now, booked.get(c.id) ?? 0) }))
  const courses = all.map((x) => x.view).filter((c) => isPublic(c.status)).sort(publicOrder)
  const visibleTracks = trackRows.filter((t) => t.visible)
  const tracks = visibleTracks.map((t) => toTrack(t, courses.filter((c) => c.track === t.slug).length, m))
  const instructors = instRows.map((p) => toInstructor(p, m))
  return { tracks, courses, instructors, rows: all }
}

export async function homeContent(): Promise<HomeContent> {
  const [row] = await db.select().from(s.settings).where(eq(s.settings.key, 'home'))
  const v = (row?.value ?? {}) as Partial<HomeContent>
  return { ...DEFAULT_HOME, ...v, heads: { ...DEFAULT_HOME.heads, ...(v.heads ?? {}) } } as HomeContent
}

export type PublicTier = { id: string; name: string; description: string; price: number; compareAt: number | null; features: string[]; highlight: boolean }

export type CourseDetail = {
  course: Course
  row: CourseRow
  tiers: PublicTier[]
  groupRules: { minQty: number; percent: number }[]
  track?: Track
  instructors: Instructor[]
  curriculum: (ModuleRow & { lessons: LessonRow[] })[]
  related: Course[]
}

/** صفحة الدورة — المسودة والمؤرشفة لا تظهر إلا برمز المعاينة */
export async function courseDetail(slug: string, preview?: string): Promise<CourseDetail | null> {
  const { tracks, instructors, rows, courses } = await catalog()
  const hit = rows.find((x) => x.row.slug === slug)
  if (!hit) return null
  const visible = isPublic(hit.view.status) || (preview && preview === hit.row.previewToken)
  if (!visible) return null
  const mods = await db.select().from(s.modules).where(eq(s.modules.courseId, hit.row.id)).orderBy(asc(s.modules.sortOrder))
  const les = mods.length
    ? await db.select().from(s.lessons).where(inArray(s.lessons.moduleId, mods.map((x) => x.id))).orderBy(asc(s.lessons.sortOrder))
    : []
  const tiers = await db.select().from(s.priceTiers).where(eq(s.priceTiers.courseId, hit.row.id)).orderBy(asc(s.priceTiers.sortOrder))
  const rules = await db.select().from(s.groupRules).where(eq(s.groupRules.courseId, hit.row.id))
  return {
    course: hit.view,
    row: hit.row,
    tiers: tiers.map(({ id, name, description, price, compareAt, features, highlight }) => ({ id, name, description, price, compareAt, features, highlight })),
    groupRules: rules.map(({ minQty, percent }) => ({ minQty, percent })).sort((a, b) => a.minQty - b.minQty),
    track: tracks.find((t) => t.slug === hit.view.track),
    instructors: (hit.view.instructors ?? []).map((sl) => instructors.find((i) => i.slug === sl)).filter((x): x is Instructor => !!x),
    curriculum: mods.map((md) => ({ ...md, lessons: les.filter((l) => l.moduleId === md.id) })),
    related: courses.filter((c) => c.track === hit.view.track && c.slug !== slug).slice(0, 3),
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
