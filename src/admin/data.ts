import 'server-only'
/* قراءات اللوحة — تشمل المسودات، ولا تُستدعى إلا بعد requireAdmin. */
import { asc, desc, eq, isNotNull, isNull } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { requirePermission } from '@/server/auth'

export async function adminLists() {
  await requirePermission('content.read')
  const [courses, tracks, instructors, media, links] = await Promise.all([
    db.select().from(s.courses).where(isNull(s.courses.deletedAt)).orderBy(asc(s.courses.sortOrder)),
    db.select().from(s.tracks).where(isNull(s.tracks.deletedAt)).orderBy(asc(s.tracks.sortOrder)),
    db.select().from(s.instructors).where(isNull(s.instructors.deletedAt)).orderBy(asc(s.instructors.sortOrder)),
    db.select().from(s.media).where(isNull(s.media.deletedAt)).orderBy(desc(s.media.createdAt)),
    db.select().from(s.courseInstructors),
  ])
  return { courses, tracks, instructors, media, links }
}

export async function courseForEdit(id: string) {
  await requirePermission('content.read')
  const [course] = await db.select().from(s.courses).where(eq(s.courses.id, id))
  if (!course) return null
  const mods = await db.select().from(s.modules).where(eq(s.modules.courseId, id)).orderBy(asc(s.modules.sortOrder))
  const lessons = await db.select().from(s.lessons).orderBy(asc(s.lessons.sortOrder))
  const links = await db.select().from(s.courseInstructors).where(eq(s.courseInstructors.courseId, id)).orderBy(asc(s.courseInstructors.sortOrder))
  const tiers = await db.select().from(s.priceTiers).where(eq(s.priceTiers.courseId, id)).orderBy(asc(s.priceTiers.sortOrder))
  const rules = await db.select().from(s.groupRules).where(eq(s.groupRules.courseId, id))
  return {
    course,
    tiers: tiers.map(({ id, name, description, price, compareAt, features, highlight, capacity }) => ({ id, name, description, price, compareAt, features, highlight, capacity })),
    groupRules: rules.map(({ minQty, percent }) => ({ minQty, percent })).sort((a, b) => a.minQty - b.minQty),
    instructorIds: links.map((l) => l.instructorId),
    curriculum: mods.map((m) => ({ id: m.id, title: m.title, lessons: lessons.filter((l) => l.moduleId === m.id).map(({ moduleId: _m, sortOrder: _s, ...rest }) => rest) })),
  }
}

export async function trashed() {
  await requirePermission('content.read')
  const [courses, tracks, instructors, media, coupons, orgs, templates] = await Promise.all([
    db.select({ id: s.courses.id, name: s.courses.title, at: s.courses.deletedAt }).from(s.courses).where(isNotNull(s.courses.deletedAt)),
    db.select({ id: s.tracks.id, name: s.tracks.title, at: s.tracks.deletedAt }).from(s.tracks).where(isNotNull(s.tracks.deletedAt)),
    db.select({ id: s.instructors.id, name: s.instructors.name, at: s.instructors.deletedAt }).from(s.instructors).where(isNotNull(s.instructors.deletedAt)),
    db.select({ id: s.media.id, name: s.media.alt, at: s.media.deletedAt }).from(s.media).where(isNotNull(s.media.deletedAt)),
    db.select({ id: s.coupons.id, name: s.coupons.code, at: s.coupons.deletedAt }).from(s.coupons).where(isNotNull(s.coupons.deletedAt)),
    db.select({ id: s.organizations.id, name: s.organizations.name, at: s.organizations.deletedAt }).from(s.organizations).where(isNotNull(s.organizations.deletedAt)),
    db.select({ id: s.certificateTemplates.id, name: s.certificateTemplates.name, at: s.certificateTemplates.deletedAt }).from(s.certificateTemplates).where(isNotNull(s.certificateTemplates.deletedAt)),
  ])
  return [
    ...courses.map((x) => ({ ...x, entity: 'course' as const, label: 'دورة' })),
    ...tracks.map((x) => ({ ...x, entity: 'track' as const, label: 'مسار' })),
    ...instructors.map((x) => ({ ...x, entity: 'instructor' as const, label: 'مدرب' })),
    ...media.map((x) => ({ ...x, entity: 'media' as const, label: 'صورة' })),
    ...coupons.map((x) => ({ ...x, entity: 'coupon' as const, label: 'كوبون' })),
    ...orgs.map((x) => ({ ...x, entity: 'organization' as const, label: 'مؤسسة' })),
    ...templates.map((x) => ({ ...x, entity: 'template' as const, label: 'قالب شهادة' })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)))
}

export async function auditEntries(limit = 200) {
  await requirePermission('audit.read')
  return db.select({ id: s.auditLog.id, actor: s.auditLog.actor, action: s.auditLog.action, entity: s.auditLog.entity, summary: s.auditLog.summary, at: s.auditLog.at })
    .from(s.auditLog).orderBy(desc(s.auditLog.id)).limit(limit)
}
