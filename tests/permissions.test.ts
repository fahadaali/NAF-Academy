import { test } from 'node:test'
import assert from 'node:assert/strict'
import { can } from '../src/lib/permissions'

test('مصفوفة الصلاحيات', () => {
  assert.ok(can('owner', 'team.manage'))
  assert.ok(can('finance', 'sales.refund'))
  assert.equal(can('content', 'sales.refund'), false)
  assert.equal(can('support', 'sales.refund'), false)
  assert.ok(can('support', 'sales.orders'))
  assert.equal(can('instructor', 'content.write'), false)
  assert.equal(can('ghost', 'content.read'), false)
})

test('الصلاحيات المخصّصة تضيف وتحجب', () => {
  assert.ok(can('support', 'sales.refund', { '+': ['sales.refund'] }))
  assert.equal(can('owner', 'trash.purge', { '-': ['trash.purge'] }), false)
})
