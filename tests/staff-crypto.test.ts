import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  base32, fromBase32, hashPassword, lockAfter, otpauthUri, passwordProblem, readToken, signToken, stepOf, totpAt, verifyPassword, verifyTotp,
} from '../src/lib/staff-crypto'

test('تجزيء كلمة المرور والتحقق منها (ملح مختلف كل مرة)', async () => {
  const h = await hashPassword('جملة سرّية طويلة 123')
  assert.match(h, /^pbkdf2\$100000\$[\w-]+\$[\w-]+$/)
  assert.equal(await verifyPassword('جملة سرّية طويلة 123', h), true)
  assert.equal(await verifyPassword('جملة سرية طويلة 123', h), false)
  assert.notEqual(await hashPassword('x'.repeat(12)), await hashPassword('x'.repeat(12)))
  assert.equal(await verifyPassword('anything', null), false)
  assert.equal(await verifyPassword('anything', 'pbkdf2$1$a$b'), false) // تكرارات أقل من الحد مرفوضة
})

test('قواعد كلمة المرور', () => {
  assert.match(passwordProblem('short')!, /10 أحرف/)
  assert.match(passwordProblem('aaaaaaaaaaaa')!, /مكرر/)
  assert.match(passwordProblem('owner@naflaw.sa', 'owner@naflaw.sa')!, /بريدك/)
  assert.equal(passwordProblem('a good long phrase', 'owner@naflaw.sa'), null)
})

test('Base32 ذهاباً وإياباً', () => {
  const bytes = new TextEncoder().encode('12345678901234567890')
  assert.equal(base32(bytes), 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
  assert.deepEqual(fromBase32('gezd gnbv gy3t qojq gezd gnbv gy3t qojq'), bytes)
})

test('TOTP يطابق متجهات RFC 6238 (SHA-1)', async () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
  assert.equal(await totpAt(secret, stepOf(59_000)), '287082')
  assert.equal(await totpAt(secret, stepOf(1_111_111_109_000)), '081804')
  assert.equal(await totpAt(secret, stepOf(1_234_567_890_000)), '005924')
})

test('التحقق من الرمز: نافذة ±30 ثانية، ولا إعادة استعمال', async () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
  const now = 1_234_567_890_000
  const code = await totpAt(secret, stepOf(now))
  const step = await verifyTotp(secret, code, now)
  assert.equal(step, stepOf(now))
  assert.equal(await verifyTotp(secret, code, now + 30_000), stepOf(now)) // الخطوة المجاورة مقبولة
  assert.equal(await verifyTotp(secret, code, now + 90_000), null) // أبعد منها مرفوض
  assert.equal(await verifyTotp(secret, code, now, step), null) // استُعمل
  assert.equal(await verifyTotp(secret, '12345', now), null)
  assert.match(otpauthUri(secret, 'a@b.sa', 'أكاديمية ناف'), /^otpauth:\/\/totp\/.+\?secret=GEZD.+&issuer=/)
})

test('الرموز الموقّعة: الغرض والانتهاء والعبث', async () => {
  const key = 'k'.repeat(32)
  const exp = Math.floor(Date.now() / 1000) + 60
  const t = await signToken({ k: 'staff', u: 'm1', v: 2, exp }, key)
  assert.deepEqual(await readToken(t, key, 'staff'), { k: 'staff', u: 'm1', v: 2, exp })
  assert.equal(await readToken(t, key, 'staff-pw'), null) // غرض آخر
  assert.equal(await readToken(t, 'x'.repeat(32), 'staff'), null) // مفتاح آخر
  const [body, mac] = t.split('.')
  assert.equal(await readToken(`${body.slice(0, -2)}xx.${mac}`, key, 'staff'), null) // عبث بالمحتوى
  assert.equal(await readToken(t, key, 'staff', (exp + 1) * 1000), null) // منتهٍ
  assert.equal(await readToken('garbage', key, 'staff'), null)
})

test('القفل بعد المحاولات الخاطئة يتضاعف بسقف ساعتين', () => {
  const now = 1_000_000_000_000
  assert.equal(lockAfter(4, now), null)
  assert.equal(lockAfter(5, now), now / 1000 + 15 * 60)
  assert.equal(lockAfter(10, now), now / 1000 + 30 * 60)
  assert.equal(lockAfter(100, now), now / 1000 + 120 * 60)
})
