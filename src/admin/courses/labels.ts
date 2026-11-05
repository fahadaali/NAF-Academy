import type { CourseStatus } from '@/content/types'

export const STATUS_LABEL: Record<CourseStatus, string> = {
  draft: 'مسودة', scheduled: 'مجدولة', soon: 'قريباً', open: 'التسجيل مفتوح', full: 'اكتمل العدد', closed: 'انتهى التسجيل', archived: 'مؤرشفة',
}
export const STATUS_HINT: Record<CourseStatus, string> = {
  draft: 'لا تظهر إلا لك عبر رابط المعاينة',
  scheduled: 'تُفتح تلقائياً في موعد النشر',
  soon: 'ظاهرة مع «أبلغني عند الفتح»',
  open: 'ظاهرة ويمكن التسجيل',
  full: 'ظاهرة مع قائمة انتظار',
  closed: 'ظاهرة بطبقة داكنة وشارة «انتهى التسجيل»',
  archived: 'مخفية من القوائم، متاحة لمن سجّل سابقاً',
}
export const STATUS_ORDER: CourseStatus[] = ['draft', 'scheduled', 'soon', 'open', 'full', 'closed', 'archived']
