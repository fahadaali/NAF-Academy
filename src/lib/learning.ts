/* منطق التعلّم — دوال نقية مختبرة: الإتاحة، ونافذة الانضمام، والتقدّم، وتصحيح الاختبار. */
import type { Drip, PublicQuiz, Quiz } from './learning-types'

export type LessonLite = { id: string; type: string; drip: Drip; preview: boolean; startsAt?: string | null }
export type Availability = { state: 'open' } | { state: 'drip'; opensAt: string } | { state: 'sequence'; after: string } | { state: 'enroll' }

/** متى يُفتح الدرس بالجدولة: تاريخ ثابت، أو بعد أيام من التسجيل */
export function dripOpensAt(drip: Drip, enrolledAt: string): string | null {
  if (drip.mode === 'date' && drip.date) return drip.date
  if (drip.mode === 'days' && drip.days !== null) return new Date(Date.parse(enrolledAt) + drip.days * 864e5).toISOString()
  return null
}

/** الجلسات المباشرة والحضورية لا تُحسب في التسلسل — موعدها هو قفلها */
const gated = (l: LessonLite) => l.type !== 'live' && l.type !== 'onsite'

/**
 * إتاحة كل درس بالترتيب. enrolledAt = null يعني غير مسجّل (المعاينة فقط).
 * التسلسل: الدرس مقفل حتى تكتمل كل الدروس القابلة للإكمال قبله.
 */
export function availability(lessons: LessonLite[], o: { enrolledAt: string | null; sequential: boolean; completed: Set<string>; now?: Date }): Map<string, Availability> {
  const now = (o.now ?? new Date()).getTime()
  const out = new Map<string, Availability>()
  let blocker: LessonLite | null = null
  for (const l of lessons) {
    if (!o.enrolledAt) { out.set(l.id, l.preview ? { state: 'open' } : { state: 'enroll' }); continue }
    const opens = dripOpensAt(l.drip, o.enrolledAt)
    if (opens && Date.parse(opens) > now) out.set(l.id, { state: 'drip', opensAt: opens })
    else if (o.sequential && blocker && gated(l)) out.set(l.id, { state: 'sequence', after: blocker.id })
    else out.set(l.id, { state: 'open' })
    if (o.sequential && gated(l) && !o.completed.has(l.id) && !blocker) blocker = l
  }
  return out
}

export type JoinState = { state: 'upcoming'; opensAt: string } | { state: 'open' } | { state: 'ended' } | { state: 'unscheduled' }

/** زر الانضمام يُفعَّل قبل الموعد بربع ساعة ويبقى حتى النهاية (أو ساعتين إن لم تُحدَّد) */
export function joinWindow(startsAt: string | null | undefined, endsAt: string | null | undefined, now = new Date(), earlyMin = 15): JoinState {
  if (!startsAt) return { state: 'unscheduled' }
  const s = Date.parse(startsAt)
  const e = endsAt ? Date.parse(endsAt) : s + 2 * 3600e3
  const t = now.getTime()
  if (t < s - earlyMin * 60e3) return { state: 'upcoming', opensAt: new Date(s - earlyMin * 60e3).toISOString() }
  if (t <= e) return { state: 'open' }
  return { state: 'ended' }
}

/** نسبة الإكمال من الدروس القابلة للإكمال (الجلسات تُحسب بالحضور) */
export function progressPct(lessonIds: string[], completed: Set<string>): number {
  if (!lessonIds.length) return 0
  return Math.round((lessonIds.filter((id) => completed.has(id)).length / lessonIds.length) * 100)
}

/* ───────── الاختبار ───────── */

/** خلط حتمي بالبذرة — المحاولة الواحدة ترى الترتيب نفسه عند إعادة التحميل */
function seeded(seed: string) {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296
}
function shuffled<T>(a: T[], rnd: () => number): T[] {
  const x = a.slice()
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[x[i], x[j]] = [x[j], x[i]]
  }
  return x
}

/** ما يُرسل للمتصفح: بلا إجابات ولا شروح */
export function publicQuiz(q: Quiz, seed: string): PublicQuiz {
  const rnd = seeded(seed)
  const qs = q.questions.map(({ correct: _c, explanation: _e, ...rest }) => ({ ...rest, options: q.shuffle && rest.kind !== 'truefalse' ? shuffled(rest.options, rnd) : rest.options }))
  return { ...q, questions: q.shuffle ? shuffled(qs, rnd) : qs }
}

export type Graded = { scorePct: number; passed: boolean; results: Record<string, { correct: boolean; right: string[]; explanation?: string }> }

/** تصحيح على الخادم: الإجابة صحيحة إن طابقت مجموعة الصحيح تماماً، والدرجة بالنقاط */
export function gradeQuiz(q: Quiz, answers: Record<string, string[]>): Graded {
  let total = 0
  let got = 0
  const results: Graded['results'] = {}
  for (const qu of q.questions) {
    const pts = qu.points ?? 1
    total += pts
    const a = new Set((answers[qu.id] ?? []).filter((x) => qu.options.some((o) => o.id === x)))
    const ok = a.size === qu.correct.length && qu.correct.every((c) => a.has(c))
    if (ok) got += pts
    results[qu.id] = { correct: ok, right: qu.correct, explanation: qu.explanation }
  }
  const scorePct = total ? Math.round((got / total) * 100) : 0
  return { scorePct, passed: scorePct >= q.passPct, results }
}
