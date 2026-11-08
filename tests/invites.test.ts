import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inviteExpiry, inviteState, INVITE_DAYS } from '../src/lib/invites'

const now = new Date('2026-11-10T12:00:00Z')
test('حال الدعوة: المقبولة والملغاة نهائيتان، والمفتوحة تنتهي بموعدها', () => {
  const later = '2026-11-20T00:00:00Z', past = '2026-11-01T00:00:00Z'
  assert.equal(inviteState({ acceptedAt: null, revokedAt: null, expiresAt: later }, now), 'pending')
  assert.equal(inviteState({ acceptedAt: null, revokedAt: null, expiresAt: past }, now), 'expired')
  assert.equal(inviteState({ acceptedAt: past, revokedAt: null, expiresAt: past }, now), 'accepted')
  assert.equal(inviteState({ acceptedAt: null, revokedAt: past, expiresAt: later }, now), 'revoked')
})
test('الصلاحية 14 يوماً', () => {
  assert.equal(INVITE_DAYS, 14)
  assert.equal(inviteExpiry(now), '2026-11-24T12:00:00.000Z')
})
