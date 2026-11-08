/* يولّد زوج مفاتيح VAPID لإشعارات المتصفح (مرة واحدة). الخاص سرّ: wrangler secret put VAPID_PRIVATE_KEY */
const { subtle } = globalThis.crypto
const k = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const pub = Buffer.from(await subtle.exportKey('raw', k.publicKey)).toString('base64url')
const { d } = await subtle.exportKey('jwk', k.privateKey)
console.log(`VAPID_PUBLIC_KEY=${pub}\nVAPID_PRIVATE_KEY=${d}\nVAPID_SUBJECT=mailto:academy@naflaw.sa`)
