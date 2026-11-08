import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eventOf, findVerificationCode, isVerification, parseBody, PAYMENT_EVENTS } from '../src/lib/moyasar-webhook'

test('رمز التحقق أينما وُضع', () => {
  assert.equal(findVerificationCode({ type: 'webhook_verification', data: { verification_code: '482913' } }), '482913')
  assert.equal(findVerificationCode({ verification_code: 482913 }), '482913')
  assert.equal(findVerificationCode({ data: { webhook: { code: '1234 56' } } }), '123456')
  assert.equal(findVerificationCode({ data: { id: '123456', amount: 5000 } }), null) // ليس حقل رمز
  assert.equal(findVerificationCode({ data: { verification_code: 'abc' } }), null)
})

test('نوع الحدث وطلب التحقق', () => {
  assert.equal(eventOf({ event: 'webhook_verification' }), 'webhook_verification')
  assert.equal(isVerification({ type: 'webhook_verification' }), true)
  assert.equal(isVerification({ type: 'WEBHOOK_VERIFICATION' }), true)
  assert.equal(isVerification({ type: 'payment_verified' }), false)
  assert.equal(isVerification({ type: 'payment_paid' }), false)
  assert.ok(PAYMENT_EVENTS.has('payment_faild'))
})

test('الجسم JSON أو نموذج مرمّز', () => {
  assert.deepEqual(parseBody('{"type":"x"}', 'application/json'), { type: 'x' })
  assert.deepEqual(parseBody('type=webhook_verification&verification_code=111222', 'application/x-www-form-urlencoded'), { type: 'webhook_verification', verification_code: '111222' })
  assert.equal(parseBody('not json', 'application/json'), null)
  assert.equal(parseBody('[1]', 'application/json'), null)
})
