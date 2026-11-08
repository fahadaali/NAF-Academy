/* مخطط قاعدة البيانات — SQLite (libsql محلياً، Cloudflare D1 في النشر؛ المخطط نفسه).
   المبالغ بالهللة. التواريخ نص ISO. القوائم JSON. الحذف ناعم (deletedAt). */
import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const STREAM_STATUS = ['pending', 'processing', 'ready', 'error'] as const
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
  /** نسخة JPEG للصور التي لا تقرؤها صور المشاركة (WebP/AVIF) — يولّدها المتصفح عند الرفع */
  ogKey: text('og_key'),
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
  /** صورة المشهد (عريضة) — لمشهد المدربين وبطل صفحة المدرب؛ والرسمية للبطاقات */
  sceneId: text('scene_id').references(() => media.id, { onDelete: 'set null' }),
  /** طريقة الظهور: بطاقة كاملة، مختصرة، أو مخفي من الرئيسية */
  display: text('display', { enum: ['full', 'compact', 'hidden'] }).notNull().default('full'),
  featured: integer('featured', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  ...stamps,
  ...soft,
})

import { COURSE_STATUS, DELIVERY, LESSON_TYPE, LEVEL } from '../../lib/enums'
import type { Assignment, Attachment, Caption, Chapter, Drip, Quiz, Slides, VideoSource } from '../../lib/learning-types'
import type { CertDesign, CertRules, Criterion } from '../../lib/certificate'
import type { Block } from '../../lib/blocks'
export { COURSE_STATUS, DELIVERY, LESSON_TYPE, LEVEL }

export type Faq = { q: string; a: string }

export const courses = sqliteTable(
  'courses',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    subtitle: text('subtitle').notNull().default(''),
    /** العنوان بالإنجليزية — للشهادة الثنائية */
    titleEn: text('title_en').notNull().default(''),
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
    /** بداية العرض — قبلها يُدفع السعر الأصلي (فارغ = ساري من الآن) */
    saleStartsAt: text('sale_starts_at'),
    saleEndsAt: text('sale_ends_at'),
    free: integer('free', { mode: 'boolean' }).notNull().default(false),
    /** مدة الوصول بالأيام من التسجيل (أو من نهاية الدفعة) — فارغ = وصول دائم */
    accessDays: integer('access_days'),
    /** فيديو تشويقي في صفحة الدورة */
    teaser: text('teaser', { mode: 'json' }).$type<VideoSource>().notNull().default(sql`'{"provider":"none"}'`),
    /* المحتوى */
    description: text('description').notNull().default(''),
    /** الوصف كتلاً من المحرّر الغني — فارغ = يُشتق من description (المحتوى القديم) */
    content: text('content', { mode: 'json' }).$type<Block[] | null>(),
    outcomes: text('outcomes', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    audience: text('audience', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    requirements: text('requirements', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    faq: text('faq', { mode: 'json' }).$type<Faq[]>().notNull().default(sql`'[]'`),
    featured: integer('featured', { mode: 'boolean' }).notNull().default(false),
    /** خاصة: لا تظهر في الكتالوج ولا تُشترى — يُسجَّل فيها من اللوحة أو بدعوة (برامج الجامعات والتدريب التعاوني) */
    visibility: text('visibility', { enum: ['public', 'private'] }).notNull().default('public'),
    /** لا يُفتح درس حتى يكتمل ما قبله */
    sequential: integer('sequential', { mode: 'boolean' }).notNull().default(false),
    /** نسبة المشاهدة التي يُعدّ بها الفيديو مكتملاً */
    completeAt: integer('complete_at').notNull().default(90),
    certificate: text('certificate', { mode: 'json' }).$type<CertRules>().notNull().default(sql`'{}'`),
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


/* ───────── الدفعات ─────────
   دورة لها دفعات: لكل دفعة مواعيدها ومقاعدها، والمنهج واحد. مواعيد الجلسات المباشرة والحضورية لكل دفعة في cohort_sessions،
   والدورة بلا دفعات تعمل بمواعيد دروسها كما هي. */
export const COHORT_STATUS = ['soon', 'open', 'closed'] as const
export const cohorts = sqliteTable(
  'cohorts',
  {
    id: id(),
    courseId: text('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    status: text('status', { enum: COHORT_STATUS }).notNull().default('open'),
    startsAt: text('starts_at'),
    endsAt: text('ends_at'),
    seatsTotal: integer('seats_total'),
    seatsTaken: integer('seats_taken').notNull().default(0),
    city: text('city').notNull().default(''),
    venue: text('venue').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    ...stamps,
    ...soft,
  },
  (t) => [index('cohorts_course_idx').on(t.courseId)],
)

export const cohortSessions = sqliteTable(
  'cohort_sessions',
  {
    cohortId: text('cohort_id').notNull().references(() => cohorts.id, { onDelete: 'cascade' }),
    lessonId: text('lesson_id').notNull().references(() => lessons.id, { onDelete: 'cascade' }),
    startsAt: text('starts_at'),
    endsAt: text('ends_at'),
    joinUrl: text('join_url').notNull().default(''),
    location: text('location').notNull().default(''),
    recording: text('recording', { mode: 'json' }).$type<VideoSource | null>(),
    zoomMeetingId: text('zoom_meeting_id'),
    ...stamps,
  },
  (t) => [primaryKey({ columns: [t.cohortId, t.lessonId] }), index('cohort_sessions_start_idx').on(t.startsAt), index('cohort_sessions_zoom_idx').on(t.zoomMeetingId)],
)
export type CohortRow = typeof cohorts.$inferSelect
export type CohortSessionRow = typeof cohortSessions.$inferSelect

/* ───────── العروض العامة ─────────
   خصم تلقائي على المنصة كلها أو مسارات أو دورات في نافذة زمنية — يختار التسعير الأفضل للمشتري بينه وبين عرض الدورة (بلا تراكم). */
export const PROMO_SCOPE = ['all', 'tracks', 'courses'] as const
export const promotions = sqliteTable('promotions', {
  id: id(),
  label: text('label').notNull(),
  scope: text('scope', { enum: PROMO_SCOPE }).notNull().default('all'),
  trackIds: text('track_ids', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  courseIds: text('course_ids', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  kind: text('kind', { enum: ['percent', 'amount'] }).notNull().default('percent'),
  /** نسبة 1–90 أو مبلغ بالهللة */
  value: integer('value').notNull(),
  startsAt: text('starts_at'),
  endsAt: text('ends_at'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  ...stamps,
  ...soft,
})
export type PromotionRow = typeof promotions.$inferSelect

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
  /* المحتوى بحسب النوع */
  video: text('video', { mode: 'json' }).$type<VideoSource>().notNull().default(sql`'{"provider":"none"}'`),
  chapters: text('chapters', { mode: 'json' }).$type<Chapter[]>().notNull().default(sql`'[]'`),
  body: text('body').notNull().default(''),
  attachments: text('attachments', { mode: 'json' }).$type<Attachment[]>().notNull().default(sql`'[]'`),
  quiz: text('quiz', { mode: 'json' }).$type<Quiz>(),
  assignment: text('assignment', { mode: 'json' }).$type<Assignment>(),
  /** درس «سلايدات»: ملف PDF يُعرض شريحةً شريحة */
  slides: text('slides', { mode: 'json' }).$type<Slides>(),
  drip: text('drip', { mode: 'json' }).$type<Drip>().notNull().default(sql`'{"mode":"none","date":null,"days":null}'`),
  /* للجلسات المباشرة والحضورية */
  startsAt: text('starts_at'),
  endsAt: text('ends_at'),
  joinUrl: text('join_url').notNull().default(''),
  location: text('location').notNull().default(''),
  recording: text('recording', { mode: 'json' }).$type<VideoSource>(),
  /** ترجمات نصية للفيديو المباشر (ملفات VTT خاصة) — وفيديو Stream ترجماته في Stream نفسه */
  captions: text('captions', { mode: 'json' }).$type<Caption[]>().notNull().default(sql`'[]'`),
  /** رقم اجتماع Zoom المستخرج من رابط الانضمام — لإلحاق التسجيل تلقائياً */
  zoomMeetingId: text('zoom_meeting_id'),
  /* حالة فيديو Stream للدرس — نسخة من stream_videos تُضبط عند الرفع والحفظ وتحديث الحالة (لعرض اللوحة دون استعلام إضافي) */
  streamUid: text('stream_uid'),
  streamStatus: text('stream_status', { enum: STREAM_STATUS }),
  durationSeconds: integer('duration_seconds'),
  thumbnailUrl: text('thumbnail_url'),
})

/** كل فيديو رُفع إلى Stream من المنصة — أينما استُعمل (درس، تشويقي، تسجيل). الحالة تُحدَّث من Webhook أو بالسؤال الدوري. */
export const streamVideos = sqliteTable('stream_videos', {
  uid: text('uid').primaryKey(),
  status: text('status', { enum: STREAM_STATUS }).notNull().default('pending'),
  /** نسبة المعالجة 0–100 أثناء processing */
  pct: integer('pct').notNull().default(0),
  durationSeconds: integer('duration_seconds'),
  /** صورة Stream المصغّرة (للّوحة) — المتدرب يأخذها برمز موقّع */
  thumbnailUrl: text('thumbnail_url'),
  error: text('error').notNull().default(''),
  /** الدرس الذي رُفع له (قد يكون جديداً لم يُحفظ بعد) */
  lessonId: text('lesson_id'),
  name: text('name').notNull().default(''),
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
}, (t) => [index('stream_videos_status').on(t.status)])

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
  /** الاسم بالإنجليزية للشهادة الثنائية — يكتبه المتدرب في ملفه */
  nameEn: text('name_en').notNull().default(''),
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
  (t) => [index('redemptions_coupon_idx').on(t.couponId), uniqueIndex('redemptions_order_uq').on(t.orderId)],
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
    /** نسبة الضريبة وقت الطلب — الفاتورة تتبعها لا الإعداد الحالي */
    vatRate: real('vat_rate').notNull().default(15),
    /** اكتمال تنفيذ الطلب بعد الدفع (التسجيل والفاتورة) — يُعاد التنفيذ إن انقطع */
    fulfilledAt: text('fulfilled_at'),
    /** مطالبة ذرّية بالإتمام: من يضعها وحده يُنفّذ (عودة المتصفح وWebhook قد يصلان معاً)، وتنتهي بعد دقائق إن انقطع */
    fulfillingAt: text('fulfilling_at'),
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
  cohortId: text('cohort_id').references(() => cohorts.id, { onDelete: 'set null' }),
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
}, (t) => [
  /* فاتورة ضريبية واحدة لكل طلب (الإشعارات الدائنة متعددة) */
  uniqueIndex('invoices_one_per_order').on(t.orderId).where(sql`kind = 'invoice'`),
])

export const ENROLL_SOURCE = ['purchase', 'free', 'grant', 'manual', 'seat', 'invite'] as const
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
    /** الدفعة — فارغ للدورات بلا دفعات */
    cohortId: text('cohort_id').references(() => cohorts.id, { onDelete: 'set null' }),
    /** نهاية الوصول — فارغ = دائم */
    accessUntil: text('access_until'),
    /** مقعد من عقد مؤسسة */
    contractId: text('contract_id'),
    ...stamps,
  },
  (t) => [
    index('enroll_course_idx').on(t.courseId), index('enroll_learner_idx').on(t.learnerId), index('enroll_cohort_idx').on(t.cohortId),
    /* تسجيل نشط واحد للمتدرب في الدورة — مهما تسابقت الطلبات */
    uniqueIndex('enroll_one_active').on(t.learnerId, t.courseId).where(sql`status = 'active'`),
  ],
)

/** مقاعد طلب جماعي — يُخصَّص كل مقعد ببريد موظف فيصير تسجيلاً */
export const seatGrants = sqliteTable('seat_grants', {
  id: id(),
  orderId: text('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  courseId: text('course_id').notNull().references(() => courses.id),
  cohortId: text('cohort_id').references(() => cohorts.id, { onDelete: 'set null' }),
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
export type OrderRow = typeof orders.$inferSelect
export type OrderItemRow = typeof orderItems.$inferSelect
export type LearnerRow = typeof learners.$inferSelect

/* ═══════════════════ الدخول ═══════════════════ */

/** فريق اللوحة — حسابات مستقلة (src/server/auth.ts و staff-auth.ts).
    الدور: owner | content | finance | instructor | support */
export const members = sqliteTable(
  'members',
  {
    userId: text('user_id').primaryKey(),
    displayName: text('display_name'),
    email: text('email'),
    role: text('role').notNull().default('support'),
    perms: text('perms'),
    isActive: integer('is_active').notNull().default(1),
    /** للمدرب: ملفه في قائمة المدربين — يُحصر دوره في دوراته */
    instructorId: text('instructor_id'),
    lastSeenAt: integer('last_seen_at'),
    createdAt: integer('created_at').notNull(),
    /* — دخول الفريق المستقل (src/server/staff-auth.ts) — */
    /** pbkdf2$<تكرارات>$<ملح>$<تجزيء> — فارغ: مدعو لم يعيّن كلمة مروره بعد */
    passwordHash: text('password_hash'),
    /** يزيد مع كل تغيير لكلمة المرور أو إيقاف أو إعادة تعيين — يُبطل الجلسات والروابط القديمة */
    sessionVersion: integer('session_version').notNull().default(0),
    /** التحقق الثنائي (TOTP): السرّ Base32، ومتى فُعّل، وآخر خطوة زمنية قُبلت (لا يُعاد استعمال رمز) */
    totpSecret: text('totp_secret'),
    totpEnabledAt: integer('totp_enabled_at'),
    totpLastStep: integer('totp_last_step'),
    /** محاولات خاطئة متتالية، وقفل مؤقت بعدها (في القاعدة — يصمد عبر نسخ العامل) */
    failedLogins: integer('failed_logins').notNull().default(0),
    lockedUntil: integer('locked_until'),
    passwordSetAt: integer('password_set_at'),
  },
  (t) => [index('idx_members_email').on(t.email)],
)

/** رموز التحقق لمرة واحدة — يُخزَّن تجزيء الرمز لا الرمز */
export const otpCodes = sqliteTable(
  'otp_codes',
  {
    id: id(),
    channel: text('channel', { enum: ['email', 'sms', 'push'] }).notNull(),
    target: text('target').notNull(),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: text('expires_at').notNull(),
    consumedAt: text('consumed_at'),
    ip: text('ip').notNull().default(''),
    ...stamps,
  },
  (t) => [index('otp_target_idx').on(t.target)],
)

/** جلسات المتدربين — يُخزَّن تجزيء الرمز، والكوكي يحمل الرمز */
export const learnerSessions = sqliteTable(
  'learner_sessions',
  {
    id: text('id').primaryKey(),
    learnerId: text('learner_id').notNull().references(() => learners.id, { onDelete: 'cascade' }),
    expiresAt: text('expires_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
    userAgent: text('user_agent').notNull().default(''),
    ...stamps,
  },
  (t) => [index('lsess_learner_idx').on(t.learnerId)],
)

/** سجل كل رسالة خرجت (بريد/جوال) — في التطوير هو صندوق البريد التجريبي */
export const messageLog = sqliteTable(
  'message_log',
  {
    id: id(),
    channel: text('channel', { enum: ['email', 'sms', 'push'] }).notNull(),
    to: text('to').notNull(),
    subject: text('subject').notNull().default(''),
    body: text('body').notNull(),
    kind: text('kind').notNull(),
    provider: text('provider').notNull(),
    status: text('status').notNull(),
    providerId: text('provider_id'),
    error: text('error'),
    /* تتبّع التسليم (أحداث مزوّد البريد) */
    deliveredAt: text('delivered_at'),
    openedAt: text('opened_at'),
    clickedAt: text('clicked_at'),
    bouncedAt: text('bounced_at'),
    complainedAt: text('complained_at'),
    opens: integer('opens').notNull().default(0),
    ...stamps,
  },
  (t) => [index('msg_to_idx').on(t.to), index('msg_provider_idx').on(t.providerId)],
)

export type MemberRow = typeof members.$inferSelect

/* ═══════════════════ التعلّم ═══════════════════ */

/** ملفات عامة (مرفقات الدروس وتسليمات الواجبات) — منفصلة عن مكتبة الصور */
export const assets = sqliteTable('assets', {
  id: id(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  /** private: لا يُنزَّل إلا للمسجّل أو الفريق */
  scope: text('scope', { enum: ['lesson', 'submission', 'contract', 'caption'] }).notNull(),
  ownerLearnerId: text('owner_learner_id'),
  ...stamps,
})

export const lessonProgress = sqliteTable(
  'lesson_progress',
  {
    learnerId: text('learner_id').notNull().references(() => learners.id, { onDelete: 'cascade' }),
    lessonId: text('lesson_id').notNull().references(() => lessons.id, { onDelete: 'cascade' }),
    courseId: text('course_id').notNull(),
    positionSec: integer('position_sec').notNull().default(0),
    watchedSec: integer('watched_sec').notNull().default(0),
    completedAt: text('completed_at'),
    ...stamps,
  },
  (t) => [primaryKey({ columns: [t.learnerId, t.lessonId] }), index('progress_course_idx').on(t.learnerId, t.courseId)],
)

export const notes = sqliteTable('notes', {
  id: id(),
  learnerId: text('learner_id').notNull().references(() => learners.id, { onDelete: 'cascade' }),
  lessonId: text('lesson_id').notNull().references(() => lessons.id, { onDelete: 'cascade' }),
  atSec: integer('at_sec'),
  body: text('body').notNull(),
  ...stamps,
}, (t) => [index('notes_lesson_idx').on(t.learnerId, t.lessonId)])

export const questions = sqliteTable('questions', {
  id: id(),
  lessonId: text('lesson_id').notNull().references(() => lessons.id, { onDelete: 'cascade' }),
  courseId: text('course_id').notNull(),
  learnerId: text('learner_id').notNull().references(() => learners.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  answer: text('answer'),
  answeredBy: text('answered_by'),
  answeredAt: text('answered_at'),
  ...stamps,
}, (t) => [index('questions_lesson_idx').on(t.lessonId)])

export const quizAttempts = sqliteTable('quiz_attempts', {
  id: id(),
  learnerId: text('learner_id').notNull().references(() => learners.id, { onDelete: 'cascade' }),
  lessonId: text('lesson_id').notNull().references(() => lessons.id, { onDelete: 'cascade' }),
  answers: text('answers', { mode: 'json' }).$type<Record<string, string[]>>().notNull().default(sql`'{}'`),
  scorePct: integer('score_pct'),
  passed: integer('passed', { mode: 'boolean' }),
  startedAt: text('started_at').notNull(),
  submittedAt: text('submitted_at'),
}, (t) => [index('attempts_idx').on(t.learnerId, t.lessonId)])

export const submissions = sqliteTable('submissions', {
  id: id(),
  learnerId: text('learner_id').notNull().references(() => learners.id, { onDelete: 'cascade' }),
  lessonId: text('lesson_id').notNull().references(() => lessons.id, { onDelete: 'cascade' }),
  courseId: text('course_id').notNull(),
  assetId: text('asset_id').references(() => assets.id, { onDelete: 'set null' }),
  note: text('note').notNull().default(''),
  status: text('status', { enum: ['submitted', 'accepted', 'revise'] }).notNull().default('submitted'),
  feedback: text('feedback').notNull().default(''),
  reviewedBy: text('reviewed_by'),
  reviewedAt: text('reviewed_at'),
  ...stamps,
}, (t) => [index('subs_lesson_idx').on(t.lessonId)])

export const attendance = sqliteTable('attendance', {
  learnerId: text('learner_id').notNull().references(() => learners.id, { onDelete: 'cascade' }),
  lessonId: text('lesson_id').notNull().references(() => lessons.id, { onDelete: 'cascade' }),
  courseId: text('course_id').notNull(),
  method: text('method', { enum: ['qr', 'manual', 'join'] }).notNull(),
  by: text('by').notNull().default(''),
  at: stamps.createdAt,
}, (t) => [primaryKey({ columns: [t.learnerId, t.lessonId] })])

/* ───────── التذكيرات والبريد ───────── */

export const NOTIFY_STATUS = ['pending', 'sending', 'sent', 'failed', 'skipped', 'cancelled'] as const

/** طابور الرسائل الآلية — المفتاح فريد فلا تتكرر رسالة، وموعد الجلسة جزء منه فتغييره يولّد تذكيرات جديدة */
export const notifications = sqliteTable('notifications', {
  id: id(),
  key: text('key').notNull().unique(),
  event: text('event').notNull(),
  channel: text('channel', { enum: ['email', 'sms', 'push'] }).notNull(),
  to: text('to').notNull(),
  learnerId: text('learner_id'),
  courseId: text('course_id'),
  ref: text('ref', { mode: 'json' }).$type<Record<string, string | number | null>>().notNull().default(sql`'{}'`),
  sendAt: text('send_at').notNull(),
  status: text('status', { enum: NOTIFY_STATUS }).notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  error: text('error').notNull().default(''),
  messageId: text('message_id'),
  sentAt: text('sent_at'),
  ...stamps,
}, (t) => [index('notify_due_idx').on(t.status, t.sendAt), index('notify_learner_idx').on(t.learnerId)])

/** إلغاء الاشتراك في الرسائل الاختيارية (التحفيز والعروض) — بالبريد، فيشمل غير المسجّلين */
export const notifyOptouts = sqliteTable('notify_optouts', {
  email: text('email').primaryKey(),
  createdAt: stamps.createdAt,
})

/* ───────── الشهادات ───────── */

export const certificateTemplates = sqliteTable('certificate_templates', {
  id: id(),
  name: text('name').notNull(),
  design: text('design', { mode: 'json' }).$type<CertDesign>().notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  ...stamps,
  deletedAt: text('deleted_at'),
})

export const CERT_STATUS = ['pending', 'issued', 'rejected', 'revoked'] as const

export const certificates = sqliteTable('certificates', {
  id: id(),
  /** رمز التحقق العام — يُولَّد عند الإصدار */
  code: text('code').unique(),
  learnerId: text('learner_id').notNull().references(() => learners.id),
  courseId: text('course_id').notNull().references(() => courses.id),
  status: text('status', { enum: CERT_STATUS }).notNull().default('pending'),
  /** لقطة عند الإصدار: لا تتغير الشهادة إن تغيّر الاسم أو الدورة أو القالب لاحقاً */
  name: text('name').notNull(),
  courseTitle: text('course_title').notNull(),
  /** لقطة الإنجليزية للشهادة الثنائية */
  nameEn: text('name_en').notNull().default(''),
  courseTitleEn: text('course_title_en').notNull().default(''),
  hours: real('hours').notNull().default(0),
  criteria: text('criteria', { mode: 'json' }).$type<Criterion[]>().notNull().default(sql`'[]'`),
  templateId: text('template_id'),
  design: text('design', { mode: 'json' }).$type<CertDesign>(),
  pdfKey: text('pdf_key'),
  issuedAt: text('issued_at'),
  decidedBy: text('decided_by'),
  reason: text('reason').notNull().default(''),
  revokedAt: text('revoked_at'),
  ...stamps,
}, (t) => [uniqueIndex('cert_learner_course').on(t.learnerId, t.courseId), index('cert_status_idx').on(t.status)])


/* ───────── المؤسسات ───────── */

export const CORP_STATUS = ['new', 'contacted', 'proposal', 'won', 'lost'] as const

/** طلبات «للمؤسسات» من الرئيسية — مسار متابعة في اللوحة */
export const corporateRequests = sqliteTable('corporate_requests', {
  id: id(),
  name: text('name').notNull(),
  org: text('org').notNull(),
  contact: text('contact').notNull(),
  size: text('size').notNull().default(''),
  interests: text('interests', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  message: text('message').notNull().default(''),
  status: text('status', { enum: CORP_STATUS }).notNull().default('new'),
  notes: text('notes').notNull().default(''),
  organizationId: text('organization_id'),
  ...stamps,
}, (t) => [index('corp_status_idx').on(t.status)])

/** حساب مؤسسة: نطاقات بريدها تربط موظفيها تلقائياً، ومسؤولوها يتابعون ويخصّصون المقاعد */
export const organizations = sqliteTable('organizations', {
  id: id(),
  name: text('name').notNull(),
  domains: text('domains', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  notes: text('notes').notNull().default(''),
  ...stamps,
  deletedAt: text('deleted_at'),
})

export const orgMembers = sqliteTable('org_members', {
  orgId: text('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  learnerId: text('learner_id').notNull().references(() => learners.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['manager', 'member'] }).notNull().default('member'),
  createdAt: stamps.createdAt,
}, (t) => [primaryKey({ columns: [t.orgId, t.learnerId] })])

/* ───────── التقييمات والتحليلات ───────── */

export const reviews = sqliteTable('reviews', {
  id: id(),
  learnerId: text('learner_id').notNull().references(() => learners.id, { onDelete: 'cascade' }),
  courseId: text('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  rating: integer('rating').notNull(),
  comment: text('comment').notNull().default(''),
  status: text('status', { enum: ['pending', 'approved', 'hidden'] }).notNull().default('pending'),
  /** الاسم كما يظهر (اختيار المتدرب: الاسم الأول أو مجهول) */
  display: text('display').notNull().default(''),
  ...stamps,
}, (t) => [uniqueIndex('review_learner_course').on(t.learnerId, t.courseId), index('review_course_idx').on(t.courseId, t.status)])

/** عدّاد يومي مجمّع بلا ملفات تعريف ولا هوية: (اليوم، المقياس، المفتاح) ← العدد */
export const statsDaily = sqliteTable('stats_daily', {
  day: text('day').notNull(),
  metric: text('metric').notNull(),
  key: text('key').notNull(),
  n: integer('n').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.day, t.metric, t.key] })])

/** اشتراكات إشعارات المتصفح */
export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: id(),
  learnerId: text('learner_id').notNull().references(() => learners.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  ...stamps,
})

export type LessonFull = typeof lessons.$inferSelect

/* ───────── المسودات المؤقتة ─────────
   ما يكتبه المحرّر قبل الحفظ — لمعاينة الصفحة كاملة على الحاسب والجوال. تنتهي بعد ساعة. */
export const drafts = sqliteTable('drafts', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  expiresAt: text('expires_at').notNull(),
})

/* ───────── عقود المؤسسات ─────────
   عدد مقاعد في نافذة زمنية لنطاق دورات — يخصّصها الفريق أو مسؤول المؤسسة فتصير تسجيلات (enrollments.contractId). */
export const CONTRACT_STATUS = ['draft', 'active', 'expired', 'cancelled'] as const
export const orgContracts = sqliteTable(
  'org_contracts',
  {
    id: id(),
    orgId: text('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    number: text('number').notNull().default(''),
    title: text('title').notNull(),
    status: text('status', { enum: CONTRACT_STATUS }).notNull().default('draft'),
    startsAt: text('starts_at'),
    endsAt: text('ends_at'),
    seats: integer('seats').notNull(),
    scope: text('scope', { enum: ['all', 'courses'] }).notNull().default('all'),
    courseIds: text('course_ids', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    /** قيمة العقد بالهللة (شاملة الضريبة) */
    total: integer('total').notNull().default(0),
    /** ملف العقد الموقّع في التخزين الخاص (assets) */
    fileId: text('file_id'),
    notes: text('notes').notNull().default(''),
    ...stamps,
    ...soft,
  },
  (t) => [index('contracts_org_idx').on(t.orgId)],
)
export type ContractRow = typeof orgContracts.$inferSelect

/* ───────── الإنجازات والإشعارات داخل المنصة ───────── */
export const achievements = sqliteTable(
  'achievements',
  {
    id: id(),
    learnerId: text('learner_id').notNull().references(() => learners.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    /** للإنجاز الخاص بدورة أو مسار — فارغ للعام */
    ref: text('ref').notNull().default(''),
    earnedAt: stamps.createdAt,
  },
  (t) => [uniqueIndex('achievement_once').on(t.learnerId, t.kind, t.ref)],
)

export const inbox = sqliteTable(
  'inbox',
  {
    id: id(),
    /** مفتاح فريد (مفتاح الرسالة أو الإنجاز) — لا تتكرر بإعادة المحاولة */
    key: text('key').notNull().unique(),
    learnerId: text('learner_id').notNull().references(() => learners.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    url: text('url').notNull().default(''),
    readAt: text('read_at'),
    createdAt: stamps.createdAt,
  },
  (t) => [index('inbox_learner_idx').on(t.learnerId, t.createdAt)],
)

/** عناوين لا يُرسل إليها البريد: ارتداد دائم أو شكوى (من أحداث المزوّد) */
export const mailSuppressions = sqliteTable('mail_suppressions', {
  email: text('email').primaryKey(),
  reason: text('reason', { enum: ['bounce', 'complaint'] }).notNull(),
  createdAt: stamps.createdAt,
})

/** دعوات التسجيل: رابط موقّع بالبريد يكمل منه المدعو بياناته فيُسجَّل في الدورة (ودفعتها).
   الدعوة المفتوحة غير المنتهية تحجز مقعداً، و`nonce` يتغيّر عند إعادة الإرسال فيبطل الرابط السابق.
   دعوة مفتوحة واحدة لكل (دورة، بريد). */
export const invitations = sqliteTable(
  'invitations',
  {
    id: id(),
    courseId: text('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
    cohortId: text('cohort_id').references(() => cohorts.id, { onDelete: 'set null' }),
    email: text('email').notNull(),
    name: text('name').notNull().default(''),
    phone: text('phone').notNull().default(''),
    nonce: text('nonce').notNull(),
    expiresAt: text('expires_at').notNull(),
    invitedBy: text('invited_by').notNull().default(''),
    sentAt: text('sent_at'),
    acceptedAt: text('accepted_at'),
    revokedAt: text('revoked_at'),
    enrollmentId: text('enrollment_id'),
    ...stamps,
  },
  (t) => [
    index('invites_course_idx').on(t.courseId),
    index('invites_cohort_idx').on(t.cohortId),
    uniqueIndex('invites_one_open').on(t.courseId, t.email).where(sql`accepted_at is null and revoked_at is null`),
  ],
)
export type InvitationRow = typeof invitations.$inferSelect
