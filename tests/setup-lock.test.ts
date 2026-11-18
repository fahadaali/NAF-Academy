import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isSetupLocked } from '../src/lib/setup-lock'

test('قفل صفحة الإعداد: مقفلة بالقيم الصريحة وحدها، ومفتوحة بغيرها (التطوير والاختبارات بلا المتغير)', () => {
  for (const v of ['1', 'true', 'TRUE', ' yes ', 'on']) assert.equal(isSetupLocked(v), true, v)
  for (const v of [undefined, '', '0', 'false', 'no', 'off', 'locked?']) assert.equal(isSetupLocked(v), false, String(v))
})
