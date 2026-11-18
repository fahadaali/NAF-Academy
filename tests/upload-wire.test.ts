import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeUpload, encodeFile, fileOf, packForm } from '../src/lib/upload-wire'

test('upload-wire: الترميز والفك يعيدان البايتات والاسم والنوع كما هي', async () => {
  const bytes = new Uint8Array(70_000).map((_, i) => (i * 131 + 7) % 256)
  const f = new File([bytes], 'U05-L02-تطبيق-مراجعة-عقد.pdf', { type: 'application/pdf' })
  const wire = await encodeFile(f)
  assert.match(wire, /^naf64\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/, 'حروف base64 والفاصل وحدها — لا بايتات خام')
  const back = decodeUpload(wire)
  assert.ok(back)
  assert.equal(back.name, f.name)
  assert.equal(back.type, 'application/pdf')
  assert.equal(back.size, bytes.length)
  assert.deepEqual(new Uint8Array(await back.arrayBuffer()), bytes)
})

test('upload-wire: packForm يرمّز الملفات ويُبقي النصوص، وfileOf يقبل الخام والمرمَّز', async () => {
  const fd = new FormData()
  fd.set('file', new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' }))
  fd.set('alt', 'شعار')
  fd.set('empty', new File([], ''))
  const packed = await packForm(fd)
  assert.equal(typeof packed.get('file'), 'string')
  assert.equal(packed.get('alt'), 'شعار')
  assert.equal(packed.get('empty'), null, 'حقل ملف فارغ بلا اختيار يُسقط')
  assert.deepEqual(new Uint8Array(await fileOf(packed)!.arrayBuffer()), new Uint8Array([1, 2, 3]))
  assert.equal(fileOf(fd)?.name, 'a.png', 'الملف الخام يُقبل كما هو')
})

test('upload-wire: النص غير المرمَّز أو التالف لا يصير ملفاً', () => {
  assert.equal(decodeUpload('hello'), null)
  assert.equal(decodeUpload('naf64.abc'), null)
  assert.equal(decodeUpload(null), null)
})
