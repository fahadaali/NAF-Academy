/* الدفعات والوصول — دوال نقية مشتركة بين الخادم والواجهة.
   الدورة بلا دفعات تعمل كما هي؛ ومتى وُجدت دفعات صارت المقاعد والمواعيد للدفعة، والمنهج واحد. */
import type { CourseStatus } from '@/content/types'

export type CohortState = 'open' | 'full' | 'soon' | 'closed'

export type CohortLite = {
  id: string
  title: string
  status: 'soon' | 'open' | 'closed'
  startsAt: string | null
  endsAt: string | null
  seatsTotal: number | null
  /** المحجوز يدوياً + التسجيلات + المقاعد غير المخصّصة */
  taken: number
  city: string
}

/** حالة الدفعة الآن: المغلقة أو المنتهية «انتهى التسجيل»، والمفتوحة بلا مقاعد «اكتمل العدد» */
export function cohortState(c: CohortLite, now = new Date()): CohortState {
  if (c.status === 'closed') return 'closed'
  if (c.endsAt && Date.parse(c.endsAt) <= now.getTime()) return 'closed'
  if (c.status === 'soon') return 'soon'
  return c.seatsTotal && c.taken >= c.seatsTotal ? 'full' : 'open'
}

const byStart = (a: CohortLite, b: CohortLite) => (a.startsAt ? Date.parse(a.startsAt) : Infinity) - (b.startsAt ? Date.parse(b.startsAt) : Infinity)

/** الدفعة التي تمثّل الدورة في البطاقة: أقرب مفتوحة، ثم أقرب مكتملة، ثم القادمة */
export function leadCohort<C extends CohortLite>(list: C[], now = new Date()): C | undefined {
  const sorted = [...list].sort(byStart)
  for (const want of ['open', 'full', 'soon'] as const) {
    const hit = sorted.find((c) => cohortState(c, now) === want)
    if (hit) return hit
  }
  return undefined
}

/** حالة الدورة ذات الدفعات: المفتوحة تتبع أفضل دفعاتها، وغيرها كما ضبطها المدير */
export function statusWithCohorts(base: CourseStatus, list: CohortLite[], now = new Date()): CourseStatus {
  if (base !== 'open' || !list.length) return base
  const states = new Set(list.map((c) => cohortState(c, now)))
  if (states.has('open')) return 'open'
  if (states.has('full')) return 'full'
  if (states.has('soon')) return 'soon'
  return 'closed'
}

const DAY = 864e5

/** نهاية الوصول: من الآن (أو من نهاية الدفعة إن كانت لاحقة) بعدد أيام الدورة — بلا أيام = دائم */
export function accessUntilFor(accessDays: number | null | undefined, cohortEndsAt: string | null | undefined, now = new Date()): string | null {
  if (!accessDays || accessDays <= 0) return null
  const from = Math.max(now.getTime(), cohortEndsAt ? Date.parse(cohortEndsAt) : 0)
  return new Date(from + accessDays * DAY).toISOString()
}

/** التسجيل ساري الوصول؟ */
export const hasAccess = (e: { status: string; accessUntil?: string | null } | null | undefined, now = new Date()) =>
  !!e && e.status === 'active' && (!e.accessUntil || Date.parse(e.accessUntil) > now.getTime())

/** يُبقي الدرس بمواعيد دفعته إن وُجدت (الموعد، الرابط، المكان، التسجيل).
    الرابط والمكان يرجعان إلى الدرس إن فرغا (غرفة ثابتة للدورة)؛ أما التسجيل فلكل جلسة دفعة تسجيلها —
    لا يرث تسجيل الدرس (جلسة أخرى في موعد آخر). ومن لا صفّ لدرسه في دفعته يأخذ الدرس كما هو. */
export function withSession<L extends { id: string; startsAt: string | null; endsAt: string | null; joinUrl: string; location: string; recording: unknown }>(
  l: L, sessions: Map<string, { startsAt: string | null; endsAt: string | null; joinUrl: string; location: string; recording: unknown }> | null,
): L {
  const x = sessions?.get(l.id)
  if (!x) return l
  return { ...l, startsAt: x.startsAt, endsAt: x.endsAt, joinUrl: x.joinUrl || l.joinUrl, location: x.location || l.location, recording: (x.recording ?? { provider: 'none' }) as L['recording'] }
}
