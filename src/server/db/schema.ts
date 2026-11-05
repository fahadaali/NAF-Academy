/* مخطط قاعدة البيانات — SQLite (libsql محلياً، Cloudflare D1 في النشر؛ المخطط نفسه).
   المبالغ بالهللة. التواريخ نص ISO. القوائم JSON. الحذف ناعم (deletedAt). */
import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

const id = () => text('id').primaryKey()
const stamps = {
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
}
const soft = { deletedAt: text('deleted_at') }

export const media = sqliteTable('media', {
  id: id(),
  key: text('key').notNull().unique(),
  mime: text('mime').notNull(),
  width: integer('width').notNull().default(0),
  height: integer('height').notNull().default(0),
  size: integer('size').notNull().default(0),
  alt: text('alt').notNull().default(''),
  /** نقطة التركيز 0–100 — تحفظ الوجه/الموضوع في كل نسبة قص */
  focalX: real('focal_x').notNull().default(50),
  focalY: real('focal_y').notNull().default(50),
  ...stamps,
  ...soft,
})

export const tracks = sqliteTable('tracks', {
  id: id(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  kicker: text('kicker').notNull().default(''),
  summary: text('summary').notNull().default(''),
  description: text('description').notNull().default(''),
  tone: text('tone', { enum: ['gold', 'olive', 'night', 'ember', 'ivory'] }).notNull().default('gold'),
  glyph: text('glyph').notNull().default(''),
  coverId: text('cover_id').references(() => media.id, { onDelete: 'set null' }),
  sortOrder: integer('sort_order').notNull().default(0),
  visible: integer('visible', { mode: 'boolean' }).notNull().default(true),
  ...stamps,
  ...soft,
})

export const instructors = sqliteTable('instructors', {
  id: id(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  title: text('title').notNull().default(''),
  bio: text('bio').notNull().default(''),
  highlights: text('highlights', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  links: text('links', { mode: 'json' }).$type<{ label: string; url: string }[]>().notNull().default(sql`'[]'`),
  photoId: text('photo_id').references(() => media.id, { onDelete: 'set null' }),
  /** طريقة الظهور: بطاقة كاملة، مختصرة، أو مخفي من الرئيسية */
  display: text('display', { enum: ['full', 'compact', 'hidden'] }).notNull().default('full'),
  featured: integer('featured', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  ...stamps,
  ...soft,
})

import { COURSE_STATUS, DELIVERY, LESSON_TYPE, LEVEL } from '../../lib/enums'
export { COURSE_STATUS, DELIVERY, LESSON_TYPE, LEVEL }

export type Faq = { q: string; a: string }

export const courses = sqliteTable(
  'courses',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    subtitle: text('subtitle').notNull().default(''),
    trackId: text('track_id').references(() => tracks.id, { onDelete: 'set null' }),
    level: text('level', { enum: LEVEL }).notNull().default('practitioner'),
    mode: text('mode', { enum: DELIVERY }).notNull().default('recorded'),
    status: text('status', { enum: COURSE_STATUS }).notNull().default('draft'),
    /** للحالة «مجدولة»: تُنشر تلقائياً في هذا الوقت */
    publishAt: text('publish_at'),
    startsAt: text('starts_at'),
    endsAt: text('ends_at'),
    hours: real('hours').notNull().default(0),
    seatsTotal: integer('seats_total'),
    /** مقاعد محجوزة يدوياً — تُضاف إليها التسجيلات الفعلية لاحقاً */
    seatsTaken: integer('seats_taken').notNull().default(0),
    city: text('city').notNull().default(''),
    venue: text('venue').notNull().default(''),
    venueMapUrl: text('venue_map_url').notNull().default(''),
    coverId: text('cover_id').references(() => media.id, { onDelete: 'set null' }),
    /* التسعير */
    price: integer('price').notNull().default(0),
    compareAt: integer('compare_at'),
    saleEndsAt: text('sale_ends_at'),
    free: integer('free', { mode: 'boolean' }).notNull().default(false),
    /* المحتوى */
    description: text('description').notNull().default(''),
    outcomes: text('outcomes', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    audience: text('audience', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    requirements: text('requirements', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    faq: text('faq', { mode: 'json' }).$type<Faq[]>().notNull().default(sql`'[]'`),
    featured: integer('featured', { mode: 'boolean' }).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    /** رابط معاينة سري للمسودات */
    previewToken: text('preview_token').notNull(),
    seoTitle: text('seo_title').notNull().default(''),
    seoDescription: text('seo_description').notNull().default(''),
    ...stamps,
    ...soft,
  },
  (t) => [index('courses_status_idx').on(t.status), index('courses_track_idx').on(t.trackId)],
)

export const courseInstructors = sqliteTable(
  'course_instructors',
  {
    courseId: text('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
    instructorId: text('instructor_id').notNull().references(() => instructors.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.courseId, t.instructorId] })],
)


export const modules = sqliteTable('modules', {
  id: id(),
  courseId: text('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
})

export const lessons = sqliteTable('lessons', {
  id: id(),
  moduleId: text('module_id').notNull().references(() => modules.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  type: text('type', { enum: LESSON_TYPE }).notNull().default('video'),
  minutes: integer('minutes').notNull().default(0),
  /** درس معاينة مجاني يظهر لغير المسجّلين */
  preview: integer('preview', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
})

/** إعدادات ومحتوى الصفحات (مفتاح ← JSON) */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: stamps.updatedAt,
})

/** سجل التدقيق: من غيّر ماذا ومتى، مع لقطة كاملة للاسترجاع */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    summary: text('summary').notNull().default(''),
    snapshot: text('snapshot', { mode: 'json' }),
    at: stamps.createdAt,
  },
  (t) => [index('audit_entity_idx').on(t.entity, t.entityId)],
)

export type Media = typeof media.$inferSelect
export type TrackRow = typeof tracks.$inferSelect
export type InstructorRow = typeof instructors.$inferSelect
export type CourseRow = typeof courses.$inferSelect
export type ModuleRow = typeof modules.$inferSelect
export type LessonRow = typeof lessons.$inferSelect

