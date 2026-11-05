/* إشعارات المتصفح (Web Push) بـ WebCrypto وحده — يعمل في Node وداخل Worker بلا مكتبات.
   التوقيع: VAPID (RFC 8292، ES256). التشفير: aes128gcm (RFC 8291 + RFC 8188). */

const enc = new TextEncoder()
export const b64u = {
  encode: (b: Uint8Array) => Buffer.from(b).toString('base64url'),
  decode: (s: string) => new Uint8Array(Buffer.from(s, 'base64url')),
}
const concat = (...a: Uint8Array[]) => { const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of a) { out.set(x, o); o += x.length } return out }
const subtle = () => globalThis.crypto.subtle

async function hmac(key: Uint8Array, data: Uint8Array) {
  const k = await subtle().importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await subtle().sign('HMAC', k, data as BufferSource))
}

/** يشفّر الحمولة لاشتراك المتصفح (p256dh + auth) */
export async function encryptPayload(payload: Uint8Array, p256dh: string, auth: string, opt: { salt?: Uint8Array; keys?: CryptoKeyPair } = {}) {
  const ua = b64u.decode(p256dh)
  const secret = b64u.decode(auth)
  const as = opt.keys ?? (await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair)
  const asPub = new Uint8Array(await subtle().exportKey('raw', as.publicKey))
  const uaKey = await subtle().importKey('raw', ua as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await subtle().deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256))
  const prkKey = await hmac(secret, shared)
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), ua, asPub, new Uint8Array([1])))
  const salt = opt.salt ?? globalThis.crypto.getRandomValues(new Uint8Array(16))
  const prk = await hmac(salt, ikm)
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16)
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12)
  const key = await subtle().importKey('raw', cek as BufferSource, 'AES-GCM', false, ['encrypt'])
  const cipher = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, key, concat(payload, new Uint8Array([2])) as BufferSource))
  const rs = new Uint8Array([0, 0, 0x10, 0])
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, cipher)
}

/** ترويسة VAPID لمزوّد الإشعارات */
export async function vapidAuth(endpoint: string, keys: { publicKey: string; privateKey: string; subject: string }, now = Date.now()) {
  const pub = b64u.decode(keys.publicKey)
  const jwk = { kty: 'EC', crv: 'P-256', d: keys.privateKey, x: b64u.encode(pub.slice(1, 33)), y: b64u.encode(pub.slice(33, 65)), ext: true }
  const key = await subtle().importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const head = b64u.encode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const body = b64u.encode(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: keys.subject })))
  const sig = new Uint8Array(await subtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`)))
  return `vapid t=${head}.${body}.${b64u.encode(sig)}, k=${keys.publicKey}`
}

export type PushResult = { ok: true } | { ok: false; gone: boolean; error: string }

/** يرسل إشعاراً واحداً. gone = الاشتراك انتهى (404/410) فيُحذف */
export async function sendPush(sub: { endpoint: string; p256dh: string; auth: string }, data: unknown, keys: { publicKey: string; privateKey: string; subject: string }): Promise<PushResult> {
  if (!/^https:\/\//.test(sub.endpoint)) return { ok: false, gone: true, error: 'endpoint' }
  const body = await encryptPayload(enc.encode(JSON.stringify(data)), sub.p256dh, sub.auth)
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { authorization: await vapidAuth(sub.endpoint, keys), 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream', ttl: '86400', urgency: 'high' },
    body: body as BodyInit,
  })
  if (r.ok) return { ok: true }
  return { ok: false, gone: r.status === 404 || r.status === 410, error: `push ${r.status}` }
}
