'use server'
/* إجراءات اللوحة — كل إجراء: جلسة ← تحقق ← كتابة ← سجل ← إعادة توليد الصفحات العامة. */
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import { imageSize } from 'image-size'
import { db, schema as s } from '@/server/db'
import { requireAdmin } from '@/server/auth'
import { audit } from '@/server/audit'
import { deleteObject, putObject } from '@/server/storage'
import type { HomeContent } from '@/content/home-defaults'
import type { CourseStatus } from '@/content/types'
import {
  courseInput, errorsOf, instructorInput, trackInput,
  type CourseInput, type InstructorInput, type Result, type TrackInput,
} from './schemas'

const now = () => new Date().toISOString()
const token = () => randomUUID().replace(/-/g, '')
const refresh = () => revalidatePath('/', 'layout')

function uniqueError(e: unknown): Result | null {
  const m = String((e as Error)?.message ?? e) + String((e as { cause?: unknown })?.cause ?? '')
  return /UNIQUE/i.test(m) ? { ok: false, errors: { slug: 'هذا الرابط مستخدم من قبل' } } : null
}

/* ───────── الدورات ───────── */

export async function saveCourse(id: string | null, raw: CourseInput): Promise<Result> {
  const admin = await requireAdmin()
  const p = courseInput.safeParse(raw)
  if (!p.success) return { ok: false, errors: errorsOf(p.error), message: 'راجع الحقول المعلّمة' }
  const { instructorIds, curriculum, ...v } = p.data
  const cid = id ?? randomUUID()
  try {
    if (id) await db.update(s.courses).set({ ...v, updatedAt: now() }).where(eq(s.courses.id, id))
    else await db.insert(s.courses).values({ ...v, id: cid, previewToken: token() })
  } catch (e) {
    return uniqueError(e) ?? { ok: false, errors: {}, message: 'تعذّر الحفظ' }
  }

  /* المدربون والمنهج يُستبدلان كاملين بالترتيب الجديد */
  const oldMods = await db.select({ id: s.modules.id }).from(s.modules).where(eq(s.modules.courseId, cid))
  if (oldMods.length) await db.delete(s.lessons).where(inArray(s.lessons.moduleId, oldMods.map((m) => m.id)))
  await db.delete(s.modules).where(eq(s.modules.courseId, cid))
  await db.delete(s.courseInstructors).where(eq(s.courseInstructors.courseId, cid))
  if (instructorIds.length)
    await db.insert(s.courseInstructors).values(instructorIds.map((iid, i) => ({ courseId: cid, instructorId: iid, sortOrder: i })))
  for (const [mi, m] of curriculum.entries()) {
    const mid = m.id && !m.id.startsWith('new-') ? m.id : randomUUID()
    await db.insert(s.modules).values({ id: mid, courseId: cid, title: m.title, sortOrder: mi })
    if (m.lessons.length)
      await db.insert(s.lessons).values(
        m.lessons.map((l, li) => ({
          id: l.id && !l.id.startsWith('new-') ? l.id : randomUUID(),
          moduleId: mid, title: l.title, type: l.type, minutes: l.minutes, preview: l.preview, sortOrder: li,
        })),
      )
  }
  await audit(admin.name, id ? 'update' : 'create', 'course', cid, v.title, p.data)
  refresh()
  return { ok: true, id: cid }
}

export async function setCourseStatus(id: string, status: CourseStatus) {
  const admin = await requireAdmin()
  await db.update(s.courses).set({ status, updatedAt: now() }).where(eq(s.courses.id, id))
  await audit(admin.name, 'status', 'course', id, status)
  refresh()
}

/** نسخة لدفعة جديدة: مسودة، بلا مقاعد محجوزة ولا مواعيد، بالمنهج والمدربين */
export async function duplicateCourse(id: string): Promise<Result> {
  const admin = await requireAdmin()
  const [c] = await db.select().from(s.courses).where(eq(s.courses.id, id))
  if (!c) return { ok: false, errors: {}, message: 'غير موجودة' }
  const nid = randomUUID()
  const suffix = Date.now().toString(36).slice(-4)
  await db.insert(s.courses).values({
    ...c, id: nid, slug: `${c.slug}-${suffix}`.slice(0, 80), title: `${c.title} (نسخة)`, status: 'draft',
    startsAt: null, endsAt: null, publishAt: null, seatsTaken: 0, previewToken: token(), createdAt: now(), updatedAt: now(), deletedAt: null,
  })
  const links = await db.select().from(s.courseInstructors).where(eq(s.courseInstructors.courseId, id))
  if (links.length) await db.insert(s.courseInstructors).values(links.map((l) => ({ ...l, courseId: nid })))
  const mods = await db.select().from(s.modules).where(eq(s.modules.courseId, id))
  for (const m of mods) {
    const mid = randomUUID()
    await db.insert(s.modules).values({ ...m, id: mid, courseId: nid })
    const ls = await db.select().from(s.lessons).where(eq(s.lessons.moduleId, m.id))
    if (ls.length) await db.insert(s.lessons).values(ls.map((l) => ({ ...l, id: randomUUID(), moduleId: mid })))
  }
  await audit(admin.name, 'duplicate', 'course', nid, `نسخة من ${c.title}`)
  return { ok: true, id: nid }
}

export async function reorder(entity: 'course' | 'track' | 'instructor', ids: string[]) {
  const admin = await requireAdmin()
  const table = entity === 'course' ? s.courses : entity === 'track' ? s.tracks : s.instructors
  for (const [i, id] of ids.entries()) await db.update(table).set({ sortOrder: i }).where(eq(table.id, id))
  await audit(admin.name, 'reorder', entity, '-', `${ids.length} عناصر`)
  refresh()
}

/* ───────── المسارات والمدربون ───────── */

export async function saveTrack(id: string | null, raw: TrackInput): Promise<Result> {
  const admin = await requireAdmin()
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
  const admin = await requireAdmin()
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

const tables = { course: s.courses, track: s.tracks, instructor: s.instructors, media: s.media } as const
export type Entity = keyof typeof tables

export async function trash(entity: Entity, id: string) {
  const admin = await requireAdmin()
  const t = tables[entity]
  await db.update(t).set({ deletedAt: now() }).where(eq(t.id, id))
  await audit(admin.name, 'trash', entity, id, 'نُقل إلى المحذوفات')
  refresh()
}

export async function restore(entity: Entity, id: string) {
  const admin = await requireAdmin()
  const t = tables[entity]
  await db.update(t).set({ deletedAt: null }).where(eq(t.id, id))
  await audit(admin.name, 'restore', entity, id, 'استُرجع من المحذوفات')
  refresh()
}

/** حذف نهائي — من صفحة المحذوفات فقط وبعد تأكيد صريح */
export async function purge(entity: Entity, id: string, confirm: string) {
  const admin = await requireAdmin()
  if (confirm !== 'حذف') return
  const t = tables[entity]
  const [row] = await db.select().from(t).where(and(eq(t.id, id), isNotNull(t.deletedAt)))
  if (!row) return
  if (entity === 'media') await deleteObject((row as typeof s.media.$inferSelect).key)
  await db.delete(t).where(eq(t.id, id))
  await audit(admin.name, 'purge', entity, id, 'حذف نهائي', row)
  refresh()
}

/* ───────── الوسائط ───────── */

const MIME: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' }
const MAX = 8 * 1024 * 1024

export async function uploadMedia(form: FormData): Promise<{ ok: boolean; id?: string; error?: string }> {
  const admin = await requireAdmin()
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
  await putObject(key, bytes)
  const alt = String(form.get('alt') ?? '').slice(0, 200) || file.name.replace(/\.[^.]+$/, '').slice(0, 200)
  await db.insert(s.media).values({ id, key, mime: file.type, width, height, size: file.size, alt })
  await audit(admin.name, 'upload', 'media', id, alt)
  return { ok: true, id }
}

export async function updateMedia(id: string, v: { alt: string; focalX: number; focalY: number }) {
  const admin = await requireAdmin()
  const clamp = (n: number) => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 50))
  await db.update(s.media).set({ alt: v.alt.slice(0, 200), focalX: clamp(v.focalX), focalY: clamp(v.focalY), updatedAt: now() }).where(eq(s.media.id, id))
  await audit(admin.name, 'update', 'media', id, v.alt)
  refresh()
}

export async function listMedia() {
  await requireAdmin()
  return db.select().from(s.media).where(isNull(s.media.deletedAt))
}

/* ───────── الرئيسية ───────── */

export async function saveHome(value: HomeContent): Promise<{ ok: boolean; message?: string }> {
  const admin = await requireAdmin()
  if (!value?.hero?.lines?.length || !Array.isArray(value.sections)) return { ok: false, message: 'محتوى غير مكتمل' }
  const clean = JSON.parse(JSON.stringify(value)) as HomeContent
  await db.insert(s.settings).values({ key: 'home', value: clean }).onConflictDoUpdate({ target: s.settings.key, set: { value: clean, updatedAt: now() } })
  await audit(admin.name, 'update', 'home', 'home', 'الصفحة الرئيسية', clean)
  refresh()
  return { ok: true }
}
