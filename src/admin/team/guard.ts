/* حارس رفع الصلاحيات في «الفريق» — دوال نقية تُختبر وحدها، وتستعملها الإجراءات والواجهة معاً.
   غير المالك: لا يمنح صلاحية لا يملكها (بمنح مباشر، أو بفكّ حجب، أو بتغيير دور)، ولا يعدّل دوره أو صلاحياته بنفسه،
   ولا يدير حساب عضو يملك ما لا يملكه هو (رابط إعادة تعيين، إيقاف، إلغاء تحقق ثنائي) — فلا يستولي عليه. المالك بلا قيد. */
import { can, PERMS, type Perm } from '@/lib/permissions'

export type Holder = { role: string; perms: Record<string, unknown> | string | null }

const parse = (x: Holder['perms']): Record<string, unknown> | null => {
  if (x === null || typeof x === 'object') return x
  try { const v = JSON.parse(x); return v && typeof v === 'object' ? (v as Record<string, unknown>) : null } catch { return null }
}

/** الصلاحيات النافذة فعلاً: الدور مع التخصيص */
export const effective = (h: Holder): Perm[] => PERMS.filter((p) => can(h.role, p, h.role === 'owner' ? null : parse(h.perms)))

/** ما يكسبه الهدف بالتغيير (من before إلى after) ولا يملكه الفاعل — فارغ = مسموح */
export function beyondActor(actor: Holder, before: Holder | null, after: Holder): Perm[] {
  if (actor.role === 'owner') return []
  const had = new Set(before ? effective(before) : [])
  const mine = new Set(effective(actor))
  return effective(after).filter((p) => !had.has(p) && !mine.has(p))
}

/** ما يملكه الهدف ولا يملكه الفاعل — غير الفارغ يمنع إدارة حسابه */
export function outranks(target: Holder, actor: Holder): Perm[] {
  if (actor.role === 'owner') return []
  const mine = new Set(effective(actor))
  return effective(target).filter((p) => !mine.has(p))
}

export const SELF = 'لا تعدّل دورك أو صلاحياتك بنفسك — يعدّلها لك المالك'
export const BEYOND = 'لا تمنح صلاحية لا تملكها أنت'
export const OUTRANKED = 'هذا العضو يملك صلاحيات لا تملكها — يديره المالك'
