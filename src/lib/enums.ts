/* القيم المعدودة — مشتركة بين المخطط والمحرّرات دون سحب drizzle إلى المتصفح */
export const COURSE_STATUS = ['draft', 'scheduled', 'soon', 'open', 'full', 'closed', 'archived'] as const
export const DELIVERY = ['recorded', 'live', 'onsite', 'blended'] as const
export const LEVEL = ['practitioner', 'proficient', 'expert'] as const
export const LESSON_TYPE = ['video', 'article', 'file', 'quiz', 'live', 'onsite', 'assignment'] as const
export const TONES = ['gold', 'olive', 'night', 'ember', 'ivory'] as const

/* وسائل الدفع الإلكتروني — تُفعَّل من «إعدادات الدفع» ويقرؤها التسجيل ونموذج الدفع */
export const PAY_METHOD_LABEL = { creditcard: 'مدى والبطاقات', applepay: 'Apple Pay', stcpay: 'STC Pay' } as const
export type PayMethod = keyof typeof PAY_METHOD_LABEL
