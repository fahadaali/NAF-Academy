/* إشعار ميسر بلا السرّ: رمزه لا يستبدل رمزاً موقّعاً صالحاً، ولا يُغرق سجل التشخيص. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acceptVerify, mergeLog, UNSIGNED_LOG_MAX, VERIFY_TTL_MS } from '../src/lib/moyasar-webhook'

test('رمز غير موقّع لا يحلّ محل رمز موقّع ما زال صالحاً', () => {
  const now = Date.parse('2026-11-08T10:00:00Z')
  const signed = { code: '111111', at: new Date(now - 60e3).toISOString(), signed: true }
  const unsigned = { code: '222222', at: new Date(now).toISOString(), signed: false }
  assert.equal(acceptVerify(signed, unsigned, now), false)
  assert.equal(acceptVerify(signed, { ...unsigned, signed: true }, now), true)
  assert.equal(acceptVerify(null, unsigned, now), true)
  assert.equal(acceptVerify({ ...signed, signed: false }, unsigned, now), true)
  /* بعد انتهاء صلاحية الموقّع يُقبل الجديد */
  assert.equal(acceptVerify({ ...signed, at: new Date(now - VERIFY_TTL_MS - 1).toISOString() }, unsigned, now), true)
})

test('سيل الطلبات غير الموقّعة لا يمحو أثر الإشعارات الحقيقية', () => {
  let log: { at: string; signed: boolean }[] = []
  for (let i = 0; i < 3; i++) log = mergeLog(log, { at: `s${i}`, signed: true }, 8)
  for (let i = 0; i < 50; i++) log = mergeLog(log, { at: `u${i}`, signed: false }, 8)
  assert.equal(log.filter((h) => h.signed).length, 3)
  assert.equal(log.filter((h) => !h.signed).length, UNSIGNED_LOG_MAX)
  assert.equal(log[0].at, 'u49', 'الأحدث أولاً')
  assert.deepEqual(mergeLog('garbage', { at: 'x', signed: true }, 8), [{ at: 'x', signed: true }])
  let full: { at: string; signed: boolean }[] = []
  for (let i = 0; i < 20; i++) full = mergeLog(full, { at: `s${i}`, signed: true }, 8)
  assert.equal(full.length, 8)
})
