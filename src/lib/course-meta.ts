import type { CourseStatus, DeliveryMode, Level } from '@/content/types'

export const modeLabel: Record<DeliveryMode, string> = {
  recorded: 'مسجّلة',
  live: 'مباشرة عن بُعد',
  onsite: 'حضورية',
  blended: 'مدمجة',
}

export const levelLabel: Record<Level, string> = {
  practitioner: 'ممارس',
  proficient: 'متمكّن',
  expert: 'خبير',
}

type StatusView = { label: string; cta: string; dim: boolean; tone: 'open' | 'soon' | 'full' | 'closed' }

export const statusView: Partial<Record<CourseStatus, StatusView>> = {
  open: { label: 'التسجيل مفتوح', cta: 'سجّل الآن', dim: false, tone: 'open' },
  soon: { label: 'قريباً', cta: 'أبلغني عند الفتح', dim: false, tone: 'soon' },
  full: { label: 'اكتمل العدد', cta: 'انضم لقائمة الانتظار', dim: false, tone: 'full' },
  closed: { label: 'انتهى التسجيل', cta: 'أبلغني بالدفعة القادمة', dim: true, tone: 'closed' },
}

/** الدورات التي تظهر للعموم */
export const isPublic = (s: CourseStatus) => s === 'open' || s === 'soon' || s === 'full' || s === 'closed'

/** الحالة الفعلية الآن: «مجدولة» تصير «مفتوحة» عند موعد نشرها، وقبله لا تظهر */
export function resolveStatus(status: CourseStatus, publishAt: string | null | undefined, now = new Date()): CourseStatus {
  if (status === 'scheduled') return publishAt && new Date(publishAt).getTime() <= now.getTime() ? 'open' : 'scheduled'
  return status
}

/** ترتيب العرض: المفتوحة والقادمة بالأقرب موعداً، ثم المكتملة، ثم المنتهية */
const rank: Partial<Record<CourseStatus, number>> = { open: 0, soon: 1, full: 2, closed: 3 }
export function publicOrder<T extends { status: CourseStatus; startsAt?: string | null }>(a: T, b: T): number {
  const r = (rank[a.status] ?? 9) - (rank[b.status] ?? 9)
  if (r) return r
  const ta = a.startsAt ? Date.parse(a.startsAt) : Infinity
  const tb = b.startsAt ? Date.parse(b.startsAt) : Infinity
  return ta - tb
}
