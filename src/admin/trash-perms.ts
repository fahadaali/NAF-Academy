/* السلة واحدة، وصلاحية كل عنصر صلاحية قسمه: من يحذف الكوبون يسترجعه، ولا يسترجعه غيره.
   مشترك بين الإجراءات (الخادم) وقائمة السلة (الواجهة). */
import type { Perm } from '@/lib/permissions'

export const TRASH_OWNER = {
  course: 'content.write', track: 'content.write', instructor: 'content.write', media: 'content.write',
  coupon: 'sales.coupons', organization: 'corporate.manage', template: 'certificates.manage',
  cohort: 'content.write', promotion: 'sales.coupons',
} as const satisfies Record<string, Perm>
export type TrashEntity = keyof typeof TRASH_OWNER
