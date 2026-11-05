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
  content: 'الدورات والمسارات والمدربون والصور والصفحة الرئيسية وقوالب الرسائل',
  finance: 'الطلبات والاسترداد والكوبونات وتقارير المبيعات',
  instructor: 'في دوراته وحدها (يُربط بملفه من هنا): مسجّلوها، وتقييم الواجبات، والرد على الأسئلة، وتسجيل الحضور، واعتماد الشهادات',
  support: 'الاطلاع على الطلبات والمسجّلين، والطلب اليدوي وتخصيص المقاعد',
}

export const PERMS = [
  'content.read', 'content.write', 'site.write',
  'sales.read', 'sales.orders', 'sales.refund', 'sales.coupons', 'payments.manage',
  'channels.manage', 'messages.read', 'learners.read',
  'trash.purge', 'team.manage', 'audit.read',
  'learning.review', 'attendance.mark', 'notify.manage', 'certificates.manage', 'certificates.templates', 'corporate.manage', 'analytics.read',
] as const
export type Perm = (typeof PERMS)[number]

const MATRIX: Record<Role, Perm[]> = {
  owner: [...PERMS],
  content: ['content.read', 'content.write', 'site.write', 'learners.read', 'audit.read', 'learning.review', 'attendance.mark', 'notify.manage', 'certificates.manage', 'certificates.templates', 'analytics.read'],
  finance: ['content.read', 'sales.read', 'sales.orders', 'sales.refund', 'sales.coupons', 'learners.read', 'messages.read', 'audit.read', 'corporate.manage', 'analytics.read'],
  instructor: ['content.read', 'learners.read', 'learning.review', 'attendance.mark', 'certificates.manage'],
  support: ['content.read', 'sales.read', 'sales.orders', 'learners.read', 'messages.read', 'attendance.mark', 'corporate.manage'],
}

export const isRole = (r: string): r is Role => (ROLES as readonly string[]).includes(r)

/** perms المخصّصة لعضو تضيف أو تحجب فوق دوره: { "+": [...], "-": [...] } */
export function can(role: string, perm: Perm, custom?: Record<string, unknown> | null): boolean {
  const base = isRole(role) ? MATRIX[role] : []
  const add = Array.isArray(custom?.['+']) ? (custom!['+'] as string[]) : []
  const del = Array.isArray(custom?.['-']) ? (custom!['-'] as string[]) : []
  return (base.includes(perm) || add.includes(perm)) && !del.includes(perm)
}

/** صلاحيات الدور وحده (قبل التخصيص) — لعرضها في نافذة صلاحيات العضو */
export const roleDefaults = (role: string): Perm[] => (isRole(role) ? [...MATRIX[role]] : [])

/** أسماء الصلاحيات ومجموعاتها في واجهة الفريق */
export const PERM_GROUPS: { title: string; perms: [Perm, string][] }[] = [
  { title: 'المحتوى والموقع', perms: [['content.read', 'الاطلاع على المحتوى'], ['content.write', 'تعديل الدورات والمسارات والمدربين والصور'], ['site.write', 'الرئيسية والصفحات العامة والهوية']] },
  { title: 'المبيعات', perms: [['sales.read', 'الاطلاع على الطلبات والتقارير'], ['sales.orders', 'الطلبات اليدوية والمقاعد والتسجيلات'], ['sales.refund', 'الاسترداد'], ['sales.coupons', 'الكوبونات والعروض العامة'], ['payments.manage', 'إعدادات الدفع']] },
  { title: 'المتدربون والتعلّم', perms: [['learners.read', 'دليل المتدربين وملفاتهم'], ['learning.review', 'الواجبات والأسئلة'], ['attendance.mark', 'الحضور والجلسات'], ['certificates.manage', 'الشهادات (الاعتماد والإلغاء)'], ['certificates.templates', 'قوالب الشهادات (للمنصة كلها)']] },
  { title: 'الرسائل والمؤسسات', perms: [['notify.manage', 'قوالب الرسائل الآلية'], ['messages.read', 'سجل الرسائل'], ['channels.manage', 'قنوات البريد والجوال والمتصفح'], ['corporate.manage', 'المؤسسات وعقودها']] },
  { title: 'الإدارة', perms: [['team.manage', 'الفريق والصلاحيات'], ['audit.read', 'سجل التعديلات'], ['analytics.read', 'التحليلات'], ['trash.purge', 'الحذف النهائي من السلة']] },
]
