/* الأدوار والصلاحيات — المصادقة مركزية (naf-id)، وما بعد الباب يُقرَّر هنا. */
export const ROLES = ['owner', 'content', 'finance', 'instructor', 'support'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'مالك',
  content: 'مدير محتوى',
  finance: 'مالية',
  instructor: 'مدرب',
  support: 'دعم',
}

export const ROLE_HINT: Record<Role, string> = {
  owner: 'كل شيء، بما فيه الفريق وإعدادات الدفع والحذف النهائي',
  content: 'الدورات والمسارات والمدربون والصور والصفحة الرئيسية',
  finance: 'الطلبات والاسترداد والكوبونات وتقارير المبيعات',
  instructor: 'الاطلاع على دوراته ومسجّليها',
  support: 'الاطلاع على الطلبات والمسجّلين، والطلب اليدوي وتخصيص المقاعد',
}

export const PERMS = [
  'content.read', 'content.write', 'site.write',
  'sales.read', 'sales.orders', 'sales.refund', 'sales.coupons', 'payments.manage',
  'channels.manage', 'messages.read', 'learners.read',
  'trash.purge', 'team.manage', 'audit.read',
] as const
export type Perm = (typeof PERMS)[number]

const MATRIX: Record<Role, Perm[]> = {
  owner: [...PERMS],
  content: ['content.read', 'content.write', 'site.write', 'learners.read', 'audit.read'],
  finance: ['content.read', 'sales.read', 'sales.orders', 'sales.refund', 'sales.coupons', 'learners.read', 'messages.read', 'audit.read'],
  instructor: ['content.read', 'learners.read'],
  support: ['content.read', 'sales.read', 'sales.orders', 'learners.read', 'messages.read'],
}

export const isRole = (r: string): r is Role => (ROLES as readonly string[]).includes(r)

/** perms المخصّصة لعضو تضيف أو تحجب فوق دوره: { "+": [...], "-": [...] } */
export function can(role: string, perm: Perm, custom?: Record<string, unknown> | null): boolean {
  const base = isRole(role) ? MATRIX[role] : []
  const add = Array.isArray(custom?.['+']) ? (custom!['+'] as string[]) : []
  const del = Array.isArray(custom?.['-']) ? (custom!['-'] as string[]) : []
  return (base.includes(perm) || add.includes(perm)) && !del.includes(perm)
}
