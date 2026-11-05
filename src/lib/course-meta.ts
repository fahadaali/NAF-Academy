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
