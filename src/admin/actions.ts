'use server'
/* إجراءات اللوحة — كل إجراء: جلسة ← تحقق ← كتابة ← سجل ← إعادة توليد الصفحات العامة. */
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { and, count, eq, isNotNull, isNull } from 'drizzle-orm'
import { imageSize } from 'image-size'
import { z } from 'zod'
import { db, schema as s } from '@/server/db'
import { requirePermission } from '@/server/auth'
import type { Perm } from '@/lib/permissions'
import { TRASH_OWNER } from './trash-perms'
import { audit } from '@/server/audit'
import { deleteObject, putObject } from '@/server/storage'
import type { HomeContent } from '@/content/home-defaults'
import type { PagesContent } from '@/content/pages-defaults'
import type { CourseStatus } from '@/content/types'
import { COURSE_STATUS } from '@/lib/enums'
import { chunksOf, inList } from '@/server/db/limits'
import {
  courseInput, errorsOf, homeInput, instructorInput, pagesInput, trackInput,
  type CourseInput, type InstructorInput, type Result, type TrackInput,
} from './schemas'

const now = () => new Date().toISOString()
const idInput = z.string().min(1).max(64)
const token = () => randomUUID().replace(/-/g, '')
const refresh = () => revalidatePath('/', 'layout')

function uniqueError(e: unknown): Result | null {
  const m = String((e as Error)?.message ?? e) + String((e as { cause?: unknown })?.cause ?? '')
  return /UNIQUE/i.test(m) ? { ok: false, errors: { slug: 'هذا الرابط مستخدم من قبل — ربما لعنصر في سلة المحذوفات' } } : null
}

/* ───────── الدورات ───────── */

export async function saveCourse(id: string | null, raw: CourseInput, opts: { confirmDrop?: boolean } = {}): Promise<Result> {
  const admin = await requirePermission('content.write')
  const p = courseInput.safeParse(raw)
  if (!p.success) return { ok: false, errors: errorsOf(p.error), message: 'راجع الحقول المعلّمة' }
  const { instructorIds, curriculum, tiers, groupRules, ...v } = p.data
  const cid = id ?? randomUUID()
  /* درس أو باقة أُزيلت من المحرّر ولها سجلات متدربين أو طلبات: لا تُحذف بصمت (الحذف يمحو التقدّم والواجبات والحضور) —
     يُطلب تأكيد صريح أولاً */
  if (id && !opts.confirmDrop) {
    const warn = await dropRisks(id, curriculum, tiers)
    if (warn) return { ok: false, errors: {}, message: warn, confirm: warn }
  }
  try {
    if (id) await db.update(s.courses).set({ ...v, updatedAt: now() }).where(eq(s.courses.id, id))
    else await db.insert(s.courses).values({ ...v, id: cid, previewToken: token() })
  } catch (e) {
    return uniqueError(e) ?? { ok: false, errors: {}, message: 'تعذّر الحفظ' }
  }

  /* المدربون يُستبدلون بالترتيب الجديد. والمنهج يُحدَّث بالمعرّفات — لا يُحذف ويُعاد إنشاؤه —
     كي يبقى تقدّم المتدربين وملاحظاتهم واختباراتهم مرتبطة بدروسها. يُحذف فقط ما أُزيل فعلاً. */
  await db.delete(s.courseInstructors).where(eq(s.courseInstructors.courseId, cid))
  for (const part of chunksOf(s.courseInstructors, instructorIds.map((iid, i) => ({ courseId: cid, instructorId: iid, sortOrder: i }))))
    await db.insert(s.courseInstructors).values(part)
  const oldMods = await db.select({ id: s.modules.id }).from(s.modules).where(eq(s.modules.courseId, cid))
  const oldModIds = new Set(oldMods.map((m) => m.id))
  const oldLessons = oldMods.length ? await db.select({ id: s.lessons.id }).from(s.lessons).where(inList(s.lessons.moduleId, [...oldModIds])) : []
  const oldLessonIds = new Set(oldLessons.map((l) => l.id))
  const keepMods = new Set<string>()
  const keepLessons = new Set<string>()
  for (const [mi, m] of curriculum.entries()) {
    const mid = m.id && oldModIds.has(m.id) ? m.id : randomUUID()
    if (oldModIds.has(mid)) await db.update(s.modules).set({ title: m.title, sortOrder: mi }).where(eq(s.modules.id, mid))
    else await db.insert(s.modules).values({ id: mid, courseId: cid, title: m.title, sortOrder: mi })
    keepMods.add(mid)
    for (const [li, l] of m.lessons.entries()) {
      const { id: lid0, ...fields } = l
      const row = { ...fields, moduleId: mid, sortOrder: li }
      if (lid0 && oldLessonIds.has(lid0)) { await db.update(s.lessons).set(row).where(eq(s.lessons.id, lid0)); keepLessons.add(lid0) }
      else { const lid = randomUUID(); await db.insert(s.lessons).values({ ...row, id: lid }); keepLessons.add(lid) }
    }
  }
  const dropLessons = [...oldLessonIds].filter((x) => !keepLessons.has(x))
  if (dropLessons.length) await db.delete(s.lessons).where(inList(s.lessons.id, dropLessons))
  const dropMods = [...oldModIds].filter((x) => !keepMods.has(x))
  if (dropMods.length) await db.delete(s.modules).where(inList(s.modules.id, dropMods))
  /* الباقات تُحدَّث بمعرّفاتها حتى لا تنقطع صلتها بالطلبات السابقة */
  const oldTiers = await db.select({ id: s.priceTiers.id }).from(s.priceTiers).where(eq(s.priceTiers.courseId, cid))
  const keep = new Set<string>()
  for (const [i, t] of tiers.entries()) {
    const known = t.id && oldTiers.some((o) => o.id === t.id)
    const row = { name: t.name, description: t.description, price: t.price, compareAt: t.compareAt, features: t.features, highlight: t.highlight, capacity: t.capacity, sortOrder: i }
    if (known) { await db.update(s.priceTiers).set(row).where(eq(s.priceTiers.id, t.id!)); keep.add(t.id!) }
    else { const tid = randomUUID(); await db.insert(s.priceTiers).values({ ...row, id: tid, courseId: cid }); keep.add(tid) }
  }
  const drop = oldTiers.filter((o) => !keep.has(o.id)).map((o) => o.id)
  if (drop.length) await db.delete(s.priceTiers).where(inList(s.priceTiers.id, drop))
  await db.delete(s.groupRules).where(eq(s.groupRules.courseId, cid))
  for (const part of chunksOf(s.groupRules, groupRules.map((g) => ({ id: randomUUID(), courseId: cid, ...g })))) await db.insert(s.groupRules).values(part)
  await audit(admin.name, id ? 'update' : 'create', 'course', cid, v.title, p.data)
  refresh()
  return { ok: true, id: cid }
}

export async function setCourseStatus(id: string, status: CourseStatus) {
  const admin = await requirePermission('content.write')
  /* SQLite لا يفرض القيم المعدودة — يُتحقق هنا قبل الكتابة */
  if (!z.enum(COURSE_STATUS).safeParse(status).success || !idInput.safeParse(id).success) return
  await db.update(s.courses).set({ status, updatedAt: now() }).where(eq(s.courses.id, id))
  await audit(admin.name, 'status', 'course', id, status)
  refresh()
}

/** نسخة لدفعة جديدة: مسودة، بلا مقاعد محجوزة ولا مواعيد، بالمنهج والمدربين */
export async function duplicateCourse(id: string): Promise<Result> {
  const admin = await requirePermission('content.write')
  if (!idInput.safeParse(id).success) return { ok: false, errors: {}, message: 'غير موجودة' }
  const [c] = await db.select().from(s.courses).where(eq(s.courses.id, id))
  if (!c) return { ok: false, errors: {}, message: 'غير موجودة' }
  const nid = randomUUID()
  const suffix = Date.now().toString(36).slice(-4)
  await db.insert(s.courses).values({
    ...c, id: nid, slug: `${c.slug}-${suffix}`.slice(0, 80), title: `${c.title} (نسخة)`, status: 'draft',
    startsAt: null, endsAt: null, publishAt: null, seatsTaken: 0, previewToken: token(), createdAt: now(), updatedAt: now(), deletedAt: null,
  })
  const links = await db.select().from(s.courseInstructors).where(eq(s.courseInstructors.courseId, id))
  for (const part of chunksOf(s.courseInstructors, links.map((l) => ({ ...l, courseId: nid })))) await db.insert(s.courseInstructors).values(part)
  const mods = await db.select().from(s.modules).where(eq(s.modules.courseId, id))
  for (const m of mods) {
    const mid = randomUUID()
    await db.insert(s.modules).values({ ...m, id: mid, courseId: nid })
    const ls = await db.select().from(s.lessons).where(eq(s.lessons.moduleId, m.id))
    for (const part of chunksOf(s.lessons, ls.map((l) => ({ ...l, id: randomUUID(), moduleId: mid })))) await db.insert(s.lessons).values(part)
  }
  const tiers = await db.select().from(s.priceTiers).where(eq(s.priceTiers.courseId, id))
  for (const part of chunksOf(s.priceTiers, tiers.map((t) => ({ ...t, id: randomUUID(), courseId: nid })))) await db.insert(s.priceTiers).values(part)
  const rules = await db.select().from(s.groupRules).where(eq(s.groupRules.courseId, id))
  for (const part of chunksOf(s.groupRules, rules.map((r) => ({ ...r, id: randomUUID(), courseId: nid })))) await db.insert(s.groupRules).values(part)
  /* «أبلغني بالدفعة القادمة»: النسخة هي الدفعة القادمة — يُنقل إليها من لم يُبلَّغ بعد، فيصله «فُتح التسجيل» عند فتحها */
  const moved = await db.update(s.interest).set({ courseId: nid, updatedAt: now() })
    .where(and(eq(s.interest.courseId, id), eq(s.interest.kind, 'next_cohort'), isNull(s.interest.notifiedAt))).returning({ id: s.interest.id })
  await audit(admin.name, 'duplicate', 'course', nid, `نسخة من ${c.title}${moved.length ? ` · نُقل ${moved.length} من قائمة «الدفعة القادمة»` : ''}`)
  refresh()
  return { ok: true, id: nid }
}

export async function reorder(entity: 'course' | 'track' | 'instructor', ids: string[]) {
  const admin = await requirePermission('content.write')
  if (!z.enum(['course', 'track', 'instructor']).safeParse(entity).success || !z.array(idInput).max(500).safeParse(ids).success) return
  const table = entity === 'course' ? s.courses : entity === 'track' ? s.tracks : s.instructors
  for (const [i, id] of ids.entries()) await db.update(table).set({ sortOrder: i }).where(eq(table.id, id))
  await audit(admin.name, 'reorder', entity, '-', `${ids.length} عناصر`)
  refresh()
}

/* ───────── المسارات والمدربون ───────── */

export async function saveTrack(id: string | null, raw: TrackInput): Promise<Result> {
  const admin = await requirePermission('content.write')
  const p = trackInput.safeParse(raw)
  if (!p.success) return { ok: false, errors: errorsOf(p.error), message: 'راجع الحقول المعلّمة' }
  const tid = id ?? randomUUID()
  try {
    if (id) await db.update(s.tracks).set({ ...p.data, updatedAt: now() }).where(eq(s.tracks.id, id))
    else await db.insert(s.tracks).values({ ...p.data, id: tid, sortOrder: 999 })
  } catch (e) {
    return uniqueError(e) ?? { ok: false, errors: {}, message: 'تعذّر الحفظ' }
  }
  await audit(admin.name, id ? 'update' : 'create', 'track', tid, p.data.title, p.data)
  refresh()
  return { ok: true, id: tid }
}

export async function saveInstructor(id: string | null, raw: InstructorInput): Promise<Result> {
  const admin = await requirePermission('content.write')
  const p = instructorInput.safeParse(raw)
  if (!p.success) return { ok: false, errors: errorsOf(p.error), message: 'راجع الحقول المعلّمة' }
  const iid = id ?? randomUUID()
  try {
    if (id) await db.update(s.instructors).set({ ...p.data, updatedAt: now() }).where(eq(s.instructors.id, id))
    else await db.insert(s.instructors).values({ ...p.data, id: iid, sortOrder: 999 })
  } catch (e) {
    return uniqueError(e) ?? { ok: false, errors: {}, message: 'تعذّر الحفظ' }
  }
  await audit(admin.name, id ? 'update' : 'create', 'instructor', iid, p.data.name, p.data)
  refresh()
  return { ok: true, id: iid }
}

/* ───────── الحذف الناعم والاسترجاع ───────── */

const tables = {
  course: s.courses, track: s.tracks, instructor: s.instructors, media: s.media, coupon: s.coupons,
  organization: s.organizations, template: s.certificateTemplates,
} as const
export type Entity = keyof typeof tables
const OWNER: Record<Entity, Perm> = TRASH_OWNER
const isEntity = (e: unknown): e is Entity => typeof e === 'string' && Object.hasOwn(tables, e)

export async function trash(entity: Entity, id: string) {
  if (!isEntity(entity)) return
  const admin = await requirePermission(OWNER[entity])
  if (!idInput.safeParse(id).success) return
  const t = tables[entity]
  await db.update(t).set({ deletedAt: now() }).where(eq(t.id, id))
  await audit(admin.name, 'trash', entity, id, 'نُقل إلى المحذوفات')
  refresh()
}

export async function restore(entity: Entity, id: string) {
  if (!isEntity(entity)) return
  const admin = await requirePermission(OWNER[entity])
  if (!idInput.safeParse(id).success) return
  const t = tables[entity]
  await db.update(t).set({ deletedAt: null }).where(eq(t.id, id))
  await audit(admin.name, 'restore', entity, id, 'استُرجع من المحذوفات')
  refresh()
}

/** حذف نهائي — من صفحة المحذوفات فقط وبعد تأكيد صريح. يفكّ الارتباطات أولاً،
    ويرفض حذف دورة لها طلبات أو تسجيلات (تُؤرشف بدلاً من ذلك) حفاظاً على السجل المالي. */
export async function purge(entity: Entity, id: string, confirm: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requirePermission('trash.purge')
  if (!isEntity(entity) || !idInput.safeParse(id).success) return { ok: false, error: 'عنصر غير صالح' }
  if (confirm !== 'حذف') return { ok: false, error: 'لم يُؤكَّد الحذف' }
  const t = tables[entity]
  const [row] = await db.select().from(t).where(and(eq(t.id, id), isNotNull(t.deletedAt)))
  if (!row) return { ok: false, error: 'العنصر غير موجود في المحذوفات' }
  if (entity === 'course') {
    const [sold] = await db.select({ n: count() }).from(s.orderItems).where(eq(s.orderItems.courseId, id))
    const [enr] = await db.select({ n: count() }).from(s.enrollments).where(eq(s.enrollments.courseId, id))
    if (sold.n || enr.n) return { ok: false, error: 'للدورة طلبات أو تسجيلات — استرجعها وأرشفها بدلاً من حذفها نهائياً' }
    const mods = await db.select({ id: s.modules.id }).from(s.modules).where(eq(s.modules.courseId, id))
    if (mods.length) await db.delete(s.lessons).where(inList(s.lessons.moduleId, mods.map((m) => m.id)))
    await db.delete(s.modules).where(eq(s.modules.courseId, id))
    await db.delete(s.priceTiers).where(eq(s.priceTiers.courseId, id))
    await db.delete(s.groupRules).where(eq(s.groupRules.courseId, id))
    await db.delete(s.interest).where(eq(s.interest.courseId, id))
    await db.delete(s.courseInstructors).where(eq(s.courseInstructors.courseId, id))
  }
  if (entity === 'coupon') {
    const [used] = await db.select({ n: count() }).from(s.couponRedemptions).where(eq(s.couponRedemptions.couponId, id))
    if (used.n) return { ok: false, error: 'استُخدم هذا الكوبون في طلبات — يبقى في السجل موقوفاً ولا يُحذف نهائياً' }
  }
  if (entity === 'template') {
    const [def] = await db.select({ d: s.certificateTemplates.isDefault }).from(s.certificateTemplates).where(eq(s.certificateTemplates.id, id))
    if (def?.d) return { ok: false, error: 'القالب الافتراضي لا يُحذف — اجعل غيره افتراضياً أولاً' }
    /* الدورات التي تشير إليه تعود للقالب الافتراضي؛ والشهادات الصادرة لقطات لا تتأثر */
    const refs = await db.select({ id: s.courses.id, c: s.courses.certificate }).from(s.courses)
    for (const r of refs) if (r.c?.templateId === id) await db.update(s.courses).set({ certificate: { ...r.c, templateId: null } }).where(eq(s.courses.id, r.id))
  }
  if (entity === 'track') await db.update(s.courses).set({ trackId: null }).where(eq(s.courses.trackId, id))
  if (entity === 'instructor') await db.delete(s.courseInstructors).where(eq(s.courseInstructors.instructorId, id))
  if (entity === 'media') {
    /* صورة في الهوية أو في قالب شهادة لا تُحذف نهائياً — وإلا اختفى الشعار بصمت وتعذّر حفظ الهوية */
    const used = await mediaInUse(id)
    if (used.length) return { ok: false, error: `الصورة مستعملة في: ${used.join('، ')} — غيّرها هناك أولاً` }
    await db.update(s.courses).set({ coverId: null }).where(eq(s.courses.coverId, id))
    await db.update(s.tracks).set({ coverId: null }).where(eq(s.tracks.coverId, id))
    await db.update(s.instructors).set({ photoId: null }).where(eq(s.instructors.photoId, id))
    await deleteObject((row as typeof s.media.$inferSelect).key)
  }
  await db.delete(t).where(eq(t.id, id))
  await audit(admin.name, 'purge', entity, id, 'حذف نهائي', row)
  refresh()
  return { ok: true }
}

/* ───────── الوسائط ───────── */

const MIME: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' }
const MAX = 8 * 1024 * 1024

export async function uploadMedia(form: FormData): Promise<{ ok: boolean; id?: string; error?: string }> {
  const admin = await requirePermission('content.write')
  const file = form.get('file')
  if (!(file instanceof File)) return { ok: false, error: 'لم يُرفق ملف' }
  const ext = MIME[file.type]
  if (!ext) return { ok: false, error: 'الصيغ المقبولة: JPG وPNG وWebP وAVIF' }
  if (file.size > MAX) return { ok: false, error: 'الحد الأقصى 8 ميغابايت' }
  const bytes = new Uint8Array(await file.arrayBuffer())
  let width = 0, height = 0
  try {
    const d = imageSize(bytes)
    width = d.width ?? 0
    height = d.height ?? 0
  } catch {
    return { ok: false, error: 'الملف ليس صورة صالحة' }
  }
  const id = randomUUID()
  const key = `${id.slice(0, 8)}${Date.now().toString(36)}.${ext}`
  await putObject(key, bytes, file.type)
  const alt = String(form.get('alt') ?? '').slice(0, 200) || file.name.replace(/\.[^.]+$/, '').slice(0, 200)
  await db.insert(s.media).values({ id, key, mime: file.type, width, height, size: file.size, alt })
  await audit(admin.name, 'upload', 'media', id, alt)
  revalidatePath('/admin/media')
  return { ok: true, id }
}

export async function updateMedia(id: string, v: { alt: string; focalX: number; focalY: number }) {
  const admin = await requirePermission('content.write')
  if (!idInput.safeParse(id).success || !z.object({ alt: z.string().max(400), focalX: z.number(), focalY: z.number() }).safeParse(v).success) return
  const clamp = (n: number) => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 50))
  await db.update(s.media).set({ alt: v.alt.slice(0, 200), focalX: clamp(v.focalX), focalY: clamp(v.focalY), updatedAt: now() }).where(eq(s.media.id, id))
  await audit(admin.name, 'update', 'media', id, v.alt)
  refresh()
}

export async function listMedia() {
  await requirePermission('content.read')
  return db.select().from(s.media).where(isNull(s.media.deletedAt))
}

/* ───────── الرئيسية ───────── */

export async function saveHome(value: HomeContent): Promise<{ ok: boolean; message?: string }> {
  const admin = await requirePermission('site.write')
  const p = homeInput.safeParse(value)
  if (!p.success) return { ok: false, message: Object.values(errorsOf(p.error))[0] ?? 'محتوى غير صالح' }
  const clean = p.data as HomeContent
  await db.insert(s.settings).values({ key: 'home', value: clean }).onConflictDoUpdate({ target: s.settings.key, set: { value: clean, updatedAt: now() } })
  await audit(admin.name, 'update', 'home', 'home', 'الصفحة الرئيسية', clean)
  refresh()
  return { ok: true }
}

export async function savePages(value: PagesContent): Promise<{ ok: boolean; message?: string }> {
  const admin = await requirePermission('site.write')
  const p = pagesInput.safeParse(value)
  if (!p.success) return { ok: false, message: Object.values(errorsOf(p.error))[0] ?? 'محتوى غير صالح' }
  const clean = p.data as PagesContent
  await db.insert(s.settings).values({ key: 'pages', value: clean }).onConflictDoUpdate({ target: s.settings.key, set: { value: clean, updatedAt: now() } })
  await audit(admin.name, 'update', 'pages', 'pages', 'الصفحات العامة', clean)
  refresh()
  return { ok: true }
}

/** أين تُستعمل الصورة مما لا يحتمل غيابها: الهوية (الشعارات والأيقونة) وقوالب الشهادات */
async function mediaInUse(id: string): Promise<string[]> {
  const out: string[] = []
  const [brand] = await db.select().from(s.settings).where(eq(s.settings.key, 'brand'))
  const b = (brand?.value ?? {}) as { academy?: { light?: string | null; dark?: string | null }; naf?: { light?: string | null; dark?: string | null }; icon?: string | null }
  if (b.academy?.light === id || b.academy?.dark === id) out.push('شعار الأكاديمية')
  if (b.naf?.light === id || b.naf?.dark === id) out.push('شعار شركة ناف')
  if (b.icon === id) out.push('أيقونة التطبيق')
  const [home] = await db.select().from(s.settings).where(eq(s.settings.key, 'home'))
  if (JSON.stringify(home?.value ?? {}).includes(`"${id}"`)) out.push('الصفحة الرئيسية (الآراء أو الشركاء)')
  const tpls = await db.select({ name: s.certificateTemplates.name, design: s.certificateTemplates.design }).from(s.certificateTemplates)
  for (const t of tpls) if (JSON.stringify(t.design ?? {}).includes(`"${id}"`)) out.push(`قالب الشهادة «${t.name}»`)
  return out
}

/** ما سيضيع إن حُفظ المنهج والباقات كما هي: دروس أُزيلت ولها سجلات متدربين، وباقات أُزيلت عليها طلبات */
async function dropRisks(courseId: string, curriculum: CourseInput['curriculum'], tiers: CourseInput['tiers']): Promise<string | null> {
  const keepL = new Set(curriculum.flatMap((m) => m.lessons.map((l) => l.id).filter(Boolean) as string[]))
  const old = await db.select({ id: s.lessons.id, title: s.lessons.title }).from(s.lessons).innerJoin(s.modules, eq(s.modules.id, s.lessons.moduleId)).where(eq(s.modules.courseId, courseId))
  const gone = old.filter((l) => !keepL.has(l.id))
  const lines: string[] = []
  if (gone.length) {
    const ids = gone.map((g) => g.id)
    const tables = [s.lessonProgress, s.attendance, s.quizAttempts, s.submissions, s.questions, s.notes] as const
    const touched = new Map<string, Set<string>>()
    for (const t of tables) {
      const rows = await db.select({ lessonId: t.lessonId, learnerId: t.learnerId }).from(t).where(inList(t.lessonId, ids))
      for (const r of rows) (touched.get(r.lessonId) ?? touched.set(r.lessonId, new Set()).get(r.lessonId)!).add(r.learnerId)
    }
    for (const g of gone) if (touched.get(g.id)?.size) lines.push(`«${g.title}» (${touched.get(g.id)!.size} متدرب)`)
  }
  const keepT = new Set(tiers.map((t) => t.id).filter(Boolean) as string[])
  const oldT = await db.select({ id: s.priceTiers.id, name: s.priceTiers.name }).from(s.priceTiers).where(eq(s.priceTiers.courseId, courseId))
  for (const t of oldT.filter((x) => !keepT.has(x.id))) {
    const [o] = await db.select({ n: count() }).from(s.orderItems).where(eq(s.orderItems.tierId, t.id))
    if (o.n) lines.push(`باقة «${t.name}» (${o.n} طلب)`)
  }
  return lines.length ? `ستُحذف نهائياً مع سجلاتها: ${lines.join('، ')}. أبقها، أو أكّد الحذف.` : null
}
