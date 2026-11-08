import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { fromStream, tusMetadata, unsettled, verifyStreamSignature } from '../src/lib/stream-status'
import { tusChunks, TUS_CHUNK } from '../src/lib/tus'

test('حالة Stream ← حالتنا', () => {
  assert.equal(fromStream({ status: { state: 'pendingupload' } }).status, 'pending')
  assert.deepEqual(fromStream({ status: { state: 'inprogress', pctComplete: '42.6' } }), { status: 'processing', pct: 43, durationSeconds: null, thumbnailUrl: null, error: '' })
  assert.equal(fromStream({ status: { state: 'queued' } }).status, 'processing')
  const r = fromStream({ readyToStream: true, duration: 61.4, thumbnail: 'https://customer-x.cloudflarestream.com/u/thumbnails/thumbnail.jpg', status: { state: 'ready' } })
  assert.equal(r.status, 'ready'); assert.equal(r.pct, 100); assert.equal(r.durationSeconds, 61)
  assert.equal(fromStream({ duration: -1, status: { state: 'ready' } }).durationSeconds, null)
  const e = fromStream({ status: { state: 'error', errorReasonText: 'bad codec' } })
  assert.equal(e.status, 'error'); assert.equal(e.error, 'bad codec')
  assert.equal(fromStream({ thumbnail: 'javascript:alert(1)', status: { state: 'ready' } }).thumbnailUrl, null)
  assert.ok(unsettled('pending') && unsettled('processing') && !unsettled('ready') && !unsettled(null))
})

test('توقيع Webhook من Stream', () => {
  const secret = 'shh', body = '{"uid":"a"}', now = 1_800_000_000
  const sig = createHmac('sha256', secret).update(`${now}.${body}`).digest('hex')
  assert.equal(verifyStreamSignature(`time=${now},sig1=${sig}`, body, secret, now), true)
  assert.equal(verifyStreamSignature(`time=${now},sig1=${sig}`, body + ' ', secret, now), false) // جسم معدّل
  assert.equal(verifyStreamSignature(`time=${now},sig1=${sig}`, body, 'other', now), false) // سرّ آخر
  assert.equal(verifyStreamSignature(`time=${now},sig1=${sig}`, body, secret, now + 301), false) // قديم
  assert.equal(verifyStreamSignature(null, body, secret, now), false)
  assert.equal(verifyStreamSignature(`time=${now},sig1=zz`, body, secret, now), false)
  assert.equal(verifyStreamSignature(`time=${now},sig1=${sig}`, body, '', now), false)
})

test('tus: الترويسة والأجزاء', () => {
  assert.equal(tusMetadata({ name: 'درس', requiresignedurls: true, maxDurationSeconds: '600' }), `name ${Buffer.from('درس').toString('base64')},requiresignedurls,maxDurationSeconds NjAw`)
  assert.deepEqual(tusChunks(10), [[0, 10]])
  const c = tusChunks(TUS_CHUNK * 2 + 5)
  assert.equal(c.length, 3); assert.deepEqual(c[2], [TUS_CHUNK * 2, TUS_CHUNK * 2 + 5])
  assert.throws(() => tusChunks(10, 1000))
})
