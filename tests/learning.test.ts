import { test } from 'node:test'
import assert from 'node:assert/strict'
import { availability, gradeQuiz, joinWindow, progressPct, publicQuiz, slideReach } from '../src/lib/learning'
import type { Quiz } from '../src/lib/learning-types'

const none = { mode: 'none' as const, date: null, days: null }
const L = (id: string, o: Partial<{ type: string; drip: typeof none | { mode: 'date' | 'days'; date: string | null; days: number | null }; preview: boolean }> = {}) =>
  ({ id, type: o.type ?? 'video', drip: o.drip ?? none, preview: o.preview ?? false })
const now = new Date('2026-11-10T12:00:00Z')

test('غير المسجّل يرى المعاينة فقط', () => {
  const a = availability([L('a', { preview: true }), L('b')], { enrolledAt: null, sequential: false, completed: new Set(), now })
  assert.equal(a.get('a')!.state, 'open'); assert.equal(a.get('b')!.state, 'enroll')
})

test('الجدولة بتاريخ وبأيام بعد التسجيل', () => {
  const a = availability([L('d1', { drip: { mode: 'date', date: '2026-12-01T00:00:00Z', days: null } }), L('d2', { drip: { mode: 'days', date: null, days: 3 } }), L('d3', { drip: { mode: 'days', date: null, days: 20 } })],
    { enrolledAt: '2026-11-01T00:00:00Z', sequential: false, completed: new Set(), now })
  assert.equal(a.get('d1')!.state, 'drip'); assert.equal(a.get('d2')!.state, 'open'); assert.equal(a.get('d3')!.state, 'drip')
})

test('التسلسل يقفل ما بعد أول درس غير مكتمل، والجلسات خارجه', () => {
  const ls = [L('a'), L('live', { type: 'live' }), L('b'), L('c')]
  const a = availability(ls, { enrolledAt: '2026-11-01T00:00:00Z', sequential: true, completed: new Set(['a']), now })
  assert.equal(a.get('a')!.state, 'open'); assert.equal(a.get('live')!.state, 'open'); assert.equal(a.get('b')!.state, 'open'); assert.equal(a.get('c')!.state, 'sequence')
})

test('نافذة الانضمام: قبل ربع ساعة حتى النهاية', () => {
  const s = '2026-11-10T12:30:00Z'
  assert.equal(joinWindow(s, null, new Date('2026-11-10T12:10:00Z')).state, 'upcoming')
  assert.equal(joinWindow(s, null, new Date('2026-11-10T12:16:00Z')).state, 'open')
  assert.equal(joinWindow(s, '2026-11-10T13:00:00Z', new Date('2026-11-10T13:01:00Z')).state, 'ended')
  assert.equal(joinWindow(s, null, new Date('2026-11-10T14:00:00Z')).state, 'open')
  assert.equal(joinWindow(null, null).state, 'unscheduled')
})

test('النسبة', () => {
  assert.equal(progressPct(['a', 'b', 'c'], new Set(['a'])), 33)
  assert.equal(progressPct([], new Set()), 0)
})

const quiz: Quiz = {
  passPct: 70, attempts: 2, timeLimitMin: null, shuffle: true, showAnswers: true,
  questions: [
    { id: 'q1', kind: 'single', prompt: 'س١', options: [{ id: 'a', text: 'أ' }, { id: 'b', text: 'ب' }], correct: ['a'], explanation: 'لأن…' },
    { id: 'q2', kind: 'multi', prompt: 'س٢', options: [{ id: 'a', text: 'أ' }, { id: 'b', text: 'ب' }, { id: 'c', text: 'ج' }], correct: ['a', 'c'] },
    { id: 'q3', kind: 'truefalse', prompt: 'س٣', options: [{ id: 't', text: 'صح' }, { id: 'f', text: 'خطأ' }], correct: ['f'], points: 2 },
  ],
}

test('النسخة العامة لا تحمل الإجابات، وخلطها ثابت للبذرة نفسها', () => {
  const p = publicQuiz(quiz, 'attempt-1')
  assert.ok(!JSON.stringify(p).includes('correct'))
  assert.ok(!JSON.stringify(p).includes('لأن'))
  assert.deepEqual(publicQuiz(quiz, 'attempt-1'), p)
})

test('التصحيح بالنقاط ومطابقة المتعدد تماماً', () => {
  const full = gradeQuiz(quiz, { q1: ['a'], q2: ['c', 'a'], q3: ['f'] })
  assert.equal(full.scorePct, 100); assert.ok(full.passed)
  const partial = gradeQuiz(quiz, { q1: ['a'], q2: ['a'], q3: ['f'] })
  assert.equal(partial.scorePct, 75); assert.ok(partial.passed)
  const fail = gradeQuiz(quiz, { q1: ['b'], q2: ['a', 'b', 'c'], q3: ['f'] })
  assert.equal(fail.scorePct, 50); assert.equal(fail.passed, false)
  assert.equal(gradeQuiz(quiz, { q1: ['zzz'] }).results.q1.correct, false)
})

test('السلايدات: التقدّم شريحةً شريحة، والقفز لا يُحتسب، والإكمال عند الأخيرة', () => {
  assert.deepEqual(slideReach(0, 1, 5), { furthest: 1, done: false })
  assert.deepEqual(slideReach(1, 2, 5), { furthest: 2, done: false })
  assert.deepEqual(slideReach(2, 5, 5), { furthest: 3, done: false }, 'القفز إلى الأخيرة لا يكمل الدرس')
  assert.deepEqual(slideReach(4, 2, 5), { furthest: 4, done: false }, 'الرجوع لا ينقص')
  assert.deepEqual(slideReach(4, 5, 5), { furthest: 5, done: true })
  assert.deepEqual(slideReach(0, 1, 1), { furthest: 1, done: true }, 'شريحة واحدة')
  assert.deepEqual(slideReach(5, 99, 5), { furthest: 5, done: true }, 'لا يتجاوز العدد')
  assert.deepEqual(slideReach(0, -3, 5), { furthest: 0, done: false })
})
