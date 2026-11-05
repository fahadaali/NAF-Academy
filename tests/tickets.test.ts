import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readTicket, ticketToken } from '../src/server/tickets'

test('تذكرة الحضور تُقرأ، والمعدّلة تُرفض', () => {
  const t = ticketToken('learner-1', 'lesson-9')
  assert.deepEqual(readTicket(t), { learnerId: 'learner-1', lessonId: 'lesson-9' })
  const [b, m] = t.split('.')
  assert.equal(readTicket(`${Buffer.from('learner-2.lesson-9').toString('base64url')}.${m}`), null)
  assert.equal(readTicket(`${b}.${m.slice(0, -1)}x`), null)
  assert.equal(readTicket('garbage'), null)
})
