/* المرحلة التاسعة: تصنيف الزيارات، وتشفير إشعارات المتصفح (فكّه بمفتاح المتصفح)، وخصوصية لوحة المؤسسة، وحجز المقعد الذري. */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { classify, isBot } from '../src/lib/stats-path'
import { b64u, encryptPayload, vapidAuth } from '../src/server/notify/webpush'

const dir = mkdtempSync(join(tmpdir(), 'naf-p9-'))
process.env.DATABASE_URL = `file:${join(dir, 't.db')}`

test('تصنيف الزيارات: العامة فقط، وصفحة الدورة وصفحة التسجيل', () => {
  assert.deepEqual(classify('/courses/evidence'), [{ metric: 'view', key: '*' }, { metric: 'course', key: 'evidence' }])
  assert.deepEqual(classify('/courses/evidence/enroll?coupon=X'), [{ metric: 'view', key: '*' }, { metric: 'checkout', key: 'evidence' }])
  assert.deepEqual(classify('/'), [{ metric: 'view', key: '*' }, { metric: 'page', key: 'home' }])
  for (const p of ['/admin', '/learn/x', '/api/v', '/orders/NA-1', '/files/a']) assert.deepEqual(classify(p), [])
  assert.equal(isBot('Mozilla/5.0 (compatible; Googlebot/2.1)'), true)
  assert.equal(isBot('Mozilla/5.0 (iPhone) Safari/605'), false)
})

test('Web Push: الحمولة تُفكّ بمفتاح المتصفح (RFC 8291)', async () => {
  const { subtle } = globalThis.crypto
  const ua = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const uaPub = new Uint8Array(await subtle.exportKey('raw', ua.publicKey))
  const auth = globalThis.crypto.getRandomValues(new Uint8Array(16))
  const msg = JSON.stringify({ title: 'تذكير', body: 'جلستك بعد ساعة' })
  const body = await encryptPayload(new TextEncoder().encode(msg), b64u.encode(uaPub), b64u.encode(auth))
  /* فكّ التشفير كما يفعل المتصفح */
  const salt = body.slice(0, 16)
  const idlen = body[20]
  const asPub = body.slice(21, 21 + idlen)
  const cipher = body.slice(21 + idlen)
  const h = async (k: Uint8Array, d: Uint8Array) => new Uint8Array(await subtle.sign('HMAC', await subtle.importKey('raw', k as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), d as BufferSource))
  const cat = (...a: Uint8Array[]) => Uint8Array.from(a.flatMap((x) => [...x]))
  const asKey = await subtle.importKey('raw', asPub as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256))
  const ikm = await h(await h(auth, shared), cat(new TextEncoder().encode('WebPush: info\0'), uaPub, asPub, new Uint8Array([1])))
  const prk = await h(salt, ikm)
  const cek = (await h(prk, cat(new TextEncoder().encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16)
  const nonce = (await h(prk, cat(new TextEncoder().encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12)
  const plain = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, await subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['decrypt']), cipher as BufferSource))
  assert.equal(plain[plain.length - 1], 2, 'محدّد السجل الأخير')
  assert.equal(new TextDecoder().decode(plain.slice(0, -1)), msg)
  assert.equal(body[16] * 2 ** 24 + body[17] * 2 ** 16 + body[18] * 256 + body[19], 4096)
})

test('Web Push: توقيع VAPID صحيح بالمفتاح العام', async () => {
  const { subtle } = globalThis.crypto
  const k = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair
  const pub = b64u.encode(new Uint8Array(await subtle.exportKey('raw', k.publicKey)))
  const { d } = await subtle.exportKey('jwk', k.privateKey)
  const h = await vapidAuth('https://fcm.googleapis.com/fcm/send/abc', { publicKey: pub, privateKey: d!, subject: 'mailto:a@b.sa' })
  const m = h.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/)!
  assert.equal(m[4], pub)
  const claims = JSON.parse(Buffer.from(m[2], 'base64url').toString())
  assert.equal(claims.aud, 'https://fcm.googleapis.com')
  const ok = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k.publicKey, b64u.decode(m[3]) as BufferSource, new TextEncoder().encode(`${m[1]}.${m[2]}`))
  assert.equal(ok, true)
})

/* ───────── المؤسسات والمقاعد ───────── */
let db: typeof import('../src/server/db')['db']
let s: typeof import('../src/server/db')['schema']

before(async () => {
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  ;({ db, schema: s } = await import('../src/server/db'))
  await migrate(db, { migrationsFolder: './migrations' })
  await db.insert(s.courses).values([
    { id: 'c1', slug: 'c1', title: 'دورة الرعاية', status: 'open', price: 100000, previewToken: 'x' },
    { id: 'c2', slug: 'c2', title: 'دورة شخصية', status: 'open', price: 50000, previewToken: 'y' },
  ])
  await db.insert(s.learners).values([
    { id: 'boss', name: 'مسؤول', email: 'boss@firm.sa' },
    { id: 'emp', name: 'موظف', email: 'emp@firm.sa' },
    { id: 'out', name: 'خارجي', email: 'out@gmail.com' },
  ])
  const buyer = { name: 'مسؤول', email: 'boss@firm.sa', phone: '', org: 'شركة', vatNumber: '' }
  await db.insert(s.orders).values([
    { id: 'o1', number: 'NA-1', token: 't1', learnerId: 'boss', status: 'paid', buyer, subtotal: 300000, total: 300000, vat: 0 },
    { id: 'o2', number: 'NA-2', token: 't2', learnerId: 'emp', status: 'paid', buyer: { ...buyer, email: 'emp@firm.sa' }, subtotal: 50000, total: 50000, vat: 0 },
  ] as never)
  await db.insert(s.orderItems).values({ id: 'i1', orderId: 'o1', courseId: 'c1', title: 'د', quantity: 3, unitPrice: 100000, listPrice: 100000, lineTotal: 300000 })
  await db.insert(s.seatGrants).values([{ id: 'g1', orderId: 'o1', courseId: 'c1' }, { id: 'g2', orderId: 'o1', courseId: 'c1' }])
  /* الموظف اشترى دورة لنفسه — لا يجوز أن يراها المسؤول */
  await db.insert(s.enrollments).values({ id: 'ep', learnerId: 'emp', courseId: 'c2', orderId: 'o2', source: 'purchase' })
  await db.insert(s.organizations).values({ id: 'org', name: 'شركة', domains: ['firm.sa'] })
  await db.insert(s.orgMembers).values({ orgId: 'org', learnerId: 'boss', role: 'manager' })
})

test('حجز المقعد ذري: التخصيص المتزامن لا يخصّص المقعد مرتين', async () => {
  const { assignSeatCore } = await import('../src/server/seats')
  const [a, b] = await Promise.all([assignSeatCore('g1', 'emp@firm.sa', 'موظف', 't'), assignSeatCore('g1', 'out@gmail.com', 'خارجي', 't')])
  assert.equal([a, b].filter((x) => x.ok).length, 1)
  const en = await db.select().from(s.enrollments)
  assert.equal(en.filter((e) => e.courseId === 'c1').length, 1)
})

test('لوحة المؤسسة: الدورات المرعيّة فقط، وغير المرتبط بالنطاق لا يظهر', async () => {
  const { orgOverview, seatBelongsTo } = await import('../src/server/orgs')
  const v = await orgOverview('org')
  const emp = v.rows.find((r) => r.l.id === 'emp')
  if (emp) assert.deepEqual(emp.courses.map((c) => c.courseId), ['c1'], 'الدورة الشخصية c2 لا تظهر')
  assert.equal(v.rows.some((r) => r.l.id === 'out' && r.viaDomain), false)
  assert.equal(v.seats.length, 2)
  assert.equal(await seatBelongsTo('org', 'g2'), true)
  await db.insert(s.organizations).values({ id: 'other', name: 'أخرى', domains: [] })
  assert.equal(await seatBelongsTo('other', 'g2'), false)
})
