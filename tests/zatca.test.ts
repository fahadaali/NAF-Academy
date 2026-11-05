import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zatcaTlv } from '../src/server/payments/zatca'

test('ترميز ZATCA يطابق المثال المرجعي', () => {
  const b64 = zatcaTlv({ seller: 'Bobs Records', vatNumber: '310122393500003', timestamp: '2022-04-25T15:30:00Z', total: 100000, vat: 15000 })
  assert.equal(b64, 'AQxCb2JzIFJlY29yZHMCDzMxMDEyMjM5MzUwMDAwMwMUMjAyMi0wNC0yNVQxNTozMDowMFoEBzEwMDAuMDAFBjE1MC4wMA==')
})

test('الأسماء العربية تُرمَّز بطول البايتات لا الحروف', () => {
  const raw = Buffer.from(zatcaTlv({ seller: 'ناف', vatNumber: '3', timestamp: 't', total: 0, vat: 0 }), 'base64')
  assert.equal(raw[0], 1); assert.equal(raw[1], 6)
})
