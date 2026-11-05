import { test } from 'node:test'
import assert from 'node:assert/strict'
import { maskEmail, maskPhone, normalizePhone } from '../src/lib/phone'

test('تطبيع الجوال السعودي بصيغه', () => {
  for (const x of ['0501234567', '501234567', '966501234567', '+966 50 123 4567', '00966501234567', '٠٥٠١٢٣٤٥٦٧'])
    assert.equal(normalizePhone(x), '+966501234567', x)
  assert.equal(normalizePhone('12345'), null)
  assert.equal(normalizePhone('+971501234567'), '+971501234567')
})

test('الإخفاء', () => {
  assert.equal(maskPhone('+966501234567'), '+966•••••567')
  assert.equal(maskEmail('fahad@naf.sa'), 'f•••d@naf.sa')
})
