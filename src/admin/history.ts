'use server'
/* سجل النسخ — كل حفظ في اللوحة يحفظ لقطة كاملة في سجل التدقيق؛ هنا تُسرد لقطات عنصر وتُجلب واحدة لتُحمَّل في محرّره.
   الاسترجاع لا يكتب شيئاً: النسخة تصير تعديلاً غير محفوظ يمرّ بالحفظ العادي وتحقّقه وتأكيداته. */
import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema as s } from '@/server/db'
import { courseScope, requirePermission, type Staff } from '@/server/auth'
import type { Perm } from '@/lib/permissions'

/** الكيان كما يُسجَّل في التدقيق ← صلاحية قراءة نسخه (هي صلاحية تعديله) */
const PERM: Record<string, Perm> = {
  course: 'content.write', track: 'content.write', instructor: 'content.write', cohort: 'content.write',
  home: 'site.write', pages: 'site.write', settings: 'site.write',
  coupon: 'sales.coupons', promotion: 'sales.coupons', certificate_template: 'certificates.templates',
  contract: 'corporate.manage', payments: 'payments.manage',
}
/* الإعدادات تشترك في كيان «settings» — ولكل مفتاح صلاحية قسمه */
const SETTINGS_PERM: Record<string, Perm> = { brand: 'site.write', notify: 'notify.manage' }
const permOf = (entity: string, id: string) => (entity === 'settings' ? SETTINGS_PERM[id] : PERM[entity])

export type Version = { id: number; actor: string; action: string; summary: string; at: string }

/** المدرب محصور في دوراته: نسخ الدورة ودفعاتها لدوراته وحدها (كما في الحفظ والحذف) */
async function inScopeOf(st: Staff, entity: string, entityId: string) {
  if (entity !== 'course' && entity !== 'cohort') return true
  const scope = await courseScope(st)
  if (scope === null) return true
  if (entity === 'course') return scope.includes(entityId)
  const [k] = await db.select({ c: s.cohorts.courseId }).from(s.cohorts).where(eq(s.cohorts.id, entityId))
  return !!k && scope.includes(k.c)
}

export async function listVersions(entity: string, entityId: string): Promise<Version[]> {
  const perm = permOf(entity, entityId)
  if (!perm || !z.string().min(1).max(80).safeParse(entityId).success) return []
  const st = await requirePermission(perm)
  if (!(await inScopeOf(st, entity, entityId))) return []
  return db.select({ id: s.auditLog.id, actor: s.auditLog.actor, action: s.auditLog.action, summary: s.auditLog.summary, at: s.auditLog.at })
    .from(s.auditLog)
    .where(and(eq(s.auditLog.entity, entity), eq(s.auditLog.entityId, entityId), isNotNull(s.auditLog.snapshot)))
    .orderBy(desc(s.auditLog.at), desc(s.auditLog.id)).limit(40)
}

export async function getVersion(auditId: number): Promise<{ ok: true; snapshot: unknown } | { ok: false; error: string }> {
  if (!Number.isInteger(auditId) || auditId <= 0) return { ok: false, error: 'نسخة غير صالحة' }
  const [r] = await db.select().from(s.auditLog).where(eq(s.auditLog.id, auditId))
  if (!r?.snapshot) return { ok: false, error: 'لا لقطة لهذه النسخة' }
  const perm = permOf(r.entity, r.entityId)
  if (!perm || r.action === 'purge') return { ok: false, error: 'هذه النسخة لا تُسترجع من هنا' }
  const st = await requirePermission(perm)
  if (!(await inScopeOf(st, r.entity, r.entityId))) return { ok: false, error: 'خارج دوراتك' }
  return { ok: true, snapshot: r.snapshot }
}
