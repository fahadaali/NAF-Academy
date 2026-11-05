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


/* ═══════════════════ البيع ═══════════════════ */

export const learners = sqliteTable('learners', {
  id: id(),
  name: text('name').notNull(),
  /** البريد بأحرف صغيرة — مفتاح الربط بالحساب في مرحلة الدخول */
  email: text('email').notNull().unique(),
  phone: text('phone').notNull().default(''),
  org: text('org').notNull().default(''),
  vatNumber: text('vat_number').notNull().default(''),
  ...stamps,
})

export const priceTiers = sqliteTable('price_tiers', {
  id: id(),
  courseId: text('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  price: integer('price').notNull(),
  compareAt: integer('compare_at'),
  features: text('features', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  highlight: integer('highlight', { mode: 'boolean' }).notNull().default(false),
  /** سعة خاصة بالباقة (مثل جلسات خاصة محدودة) */
  capacity: integer('capacity'),
  sortOrder: integer('sort_order').notNull().default(0),
})

/** خصم المقاعد الجماعية: من minQty مقعداً فأكثر ← percent٪ */
export const groupRules = sqliteTable('group_rules', {
  id: id(),
  courseId: text('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  minQty: integer('min_qty').notNull(),
  percent: integer('percent').notNull(),
})

export const COUPON_KIND = ['percent', 'amount'] as const
export const COUPON_SCOPE = ['all', 'courses', 'tracks'] as const

export const coupons = sqliteTable('coupons', {
  id: id(),
  code: text('code').notNull().unique(),
  label: text('label').notNull().default(''),
  kind: text('kind', { enum: COUPON_KIND }).notNull().default('percent'),
  /** نسبة 1–100 أو مبلغ بالهللة */
  value: integer('value').notNull(),
  scope: text('scope', { enum: COUPON_SCOPE }).notNull().default('all'),
  courseIds: text('course_ids', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  trackIds: text('track_ids', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  startsAt: text('starts_at'),
  endsAt: text('ends_at'),
  maxUses: integer('max_uses'),
  maxPerLearner: integer('max_per_learner'),
  minAmount: integer('min_amount'),
  /** مثل company.sa — يقصر الكوبون على بريد المنشأة */
  emailDomain: text('email_domain').notNull().default(''),
  stackWithSale: integer('stack_with_sale', { mode: 'boolean' }).notNull().default(false),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  batch: text('batch').notNull().default(''),
  ...stamps,
  ...soft,
})

export const couponRedemptions = sqliteTable(
  'coupon_redemptions',
  {
    id: id(),
    couponId: text('coupon_id').notNull().references(() => coupons.id, { onDelete: 'cascade' }),
    orderId: text('order_id').notNull(),
    learnerId: text('learner_id').notNull(),
    amount: integer('amount').notNull(),
    ...stamps,
  },
  (t) => [index('redemptions_coupon_idx').on(t.couponId)],
)

export const ORDER_STATUS = ['pending', 'paid', 'failed', 'canceled', 'expired', 'refunded', 'partially_refunded'] as const
export const PAY_METHOD = ['gateway', 'free', 'bank_transfer', 'cash', 'grant'] as const

export const orders = sqliteTable(
  'orders',
  {
    id: id(),
    number: text('number').notNull().unique(),
    /** رمز وصول سري لصفحات الطلب والفاتورة */
    token: text('token').notNull(),
    learnerId: text('learner_id').notNull().references(() => learners.id),
    status: text('status', { enum: ORDER_STATUS }).notNull().default('pending'),
    method: text('method', { enum: PAY_METHOD }).notNull().default('gateway'),
    buyer: text('buyer', { mode: 'json' }).$type<{ name: string; email: string; phone: string; org: string; vatNumber: string }>().notNull(),
    subtotal: integer('subtotal').notNull(),
    groupDiscount: integer('group_discount').notNull().default(0),
    couponDiscount: integer('coupon_discount').notNull().default(0),
    total: integer('total').notNull(),
    vat: integer('vat').notNull(),
    refunded: integer('refunded').notNull().default(0),
    couponId: text('coupon_id').references(() => coupons.id, { onDelete: 'set null' }),
    couponCode: text('coupon_code').notNull().default(''),
    gatewayPaymentId: text('gateway_payment_id'),
    expiresAt: text('expires_at'),
    paidAt: text('paid_at'),
    note: text('note').notNull().default(''),
    /** في الطلب الجماعي: هل يحضر المشتري بنفسه (يأخذ أول مقعد) */
    attendSelf: integer('attend_self', { mode: 'boolean' }).notNull().default(true),
    createdBy: text('created_by').notNull().default('web'),
    ...stamps,
  },
  (t) => [index('orders_status_idx').on(t.status), index('orders_learner_idx').on(t.learnerId)],
)

export const orderItems = sqliteTable('order_items', {
  id: id(),
  orderId: text('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  courseId: text('course_id').notNull().references(() => courses.id),
  tierId: text('tier_id').references(() => priceTiers.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  tierName: text('tier_name').notNull().default(''),
  unitPrice: integer('unit_price').notNull(),
  listPrice: integer('list_price').notNull(),
  quantity: integer('quantity').notNull().default(1),
  lineTotal: integer('line_total').notNull(),
})

export const payments = sqliteTable('payments', {
  id: id(),
  orderId: text('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  gateway: text('gateway').notNull(),
  gatewayId: text('gateway_id').notNull().unique(),
  status: text('status').notNull(),
  amount: integer('amount').notNull(),
  method: text('method').notNull().default(''),
  message: text('message').notNull().default(''),
  ...stamps,
})

export const refunds = sqliteTable('refunds', {
  id: id(),
  orderId: text('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  amount: integer('amount').notNull(),
  reason: text('reason').notNull().default(''),
  gatewayRefundId: text('gateway_refund_id'),
  status: text('status').notNull().default('done'),
  by: text('by').notNull(),
  ...stamps,
})

export const invoices = sqliteTable('invoices', {
  id: id(),
  number: text('number').notNull().unique(),
  kind: text('kind', { enum: ['invoice', 'credit_note'] }).notNull().default('invoice'),
  orderId: text('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  refOf: text('ref_of'),
  seller: text('seller', { mode: 'json' }).$type<{ name: string; vatNumber: string; crNumber: string; address: string }>().notNull(),
  buyer: text('buyer', { mode: 'json' }).$type<{ name: string; email: string; org: string; vatNumber: string }>().notNull(),
  lines: text('lines', { mode: 'json' }).$type<{ title: string; quantity: number; unit: number; total: number }[]>().notNull(),
  total: integer('total').notNull(),
  vat: integer('vat').notNull(),
  qr: text('qr').notNull(),
  issuedAt: text('issued_at').notNull(),
})

export const ENROLL_SOURCE = ['purchase', 'free', 'grant', 'manual', 'seat'] as const
export const enrollments = sqliteTable(
  'enrollments',
  {
    id: id(),
    learnerId: text('learner_id').notNull().references(() => learners.id),
    courseId: text('course_id').notNull().references(() => courses.id),
    tierId: text('tier_id').references(() => priceTiers.id, { onDelete: 'set null' }),
    orderId: text('order_id').references(() => orders.id, { onDelete: 'set null' }),
    source: text('source', { enum: ENROLL_SOURCE }).notNull(),
    status: text('status', { enum: ['active', 'canceled'] }).notNull().default('active'),
    ...stamps,
  },
  (t) => [index('enroll_course_idx').on(t.courseId), index('enroll_learner_idx').on(t.learnerId)],
)

/** مقاعد طلب جماعي — يُخصَّص كل مقعد ببريد موظف فيصير تسجيلاً */
export const seatGrants = sqliteTable('seat_grants', {
  id: id(),
  orderId: text('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  courseId: text('course_id').notNull().references(() => courses.id),
  email: text('email'),
  enrollmentId: text('enrollment_id'),
  ...stamps,
})

export const INTEREST_KIND = ['notify_open', 'waitlist', 'next_cohort', 'register'] as const
export const interest = sqliteTable(
  'interest',
  {
    id: id(),
    courseId: text('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: INTEREST_KIND }).notNull(),
    name: text('name').notNull().default(''),
    email: text('email').notNull(),
    phone: text('phone').notNull().default(''),
    notifiedAt: text('notified_at'),
    ...stamps,
  },
  (t) => [index('interest_course_idx').on(t.courseId)],
)

export const counters = sqliteTable('counters', {
  key: text('key').primaryKey(),
  value: integer('value').notNull().default(0),
})

export type CouponRow = typeof coupons.$inferSelect
export type TierRow = typeof priceTiers.$inferSelect
export type GroupRuleRow = typeof groupRules.$inferSelect
export type OrderRow = typeof orders.$inferSelect
export type OrderItemRow = typeof orderItems.$inferSelect
export type LearnerRow = typeof learners.$inferSelect
