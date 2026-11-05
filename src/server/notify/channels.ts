import 'server-only'
/* قنوات الرسائل — بريد (Resend) وجوال (تقنيات SMS). كل قناة مقفلة حتى تُربط وتُفعَّل من اللوحة.
   في التطوير بلا مفاتيح: «صندوق تجريبي» يحفظ الرسالة ويعرضها في اللوحة ولا يرسلها. */
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db, schema as s } from '../db'
import { envVar } from '../runtime'
import { getSetting, setSetting } from '../settings'

export type Channel = 'email' | 'sms' | 'push'
export type ChannelState = { configured: boolean; provider: 'resend' | 'taqnyat' | 'webpush' | 'outbox' | null; problem?: string }
export type ChannelSettings = { emailEnabled: boolean; smsEnabled: boolean; pushEnabled: boolean }
export const DEFAULT_CHANNELS: ChannelSettings = { emailEnabled: false, smsEnabled: false, pushEnabled: false }

const dev = () => process.env.NODE_ENV !== 'production'

export function channelState(c: Channel): ChannelState {
  if (c === 'email') {
    if (envVar('RESEND_API_KEY') && envVar('MAIL_FROM')) return { configured: true, provider: 'resend' }
    if (dev()) return { configured: true, provider: 'outbox' }
    return { configured: false, provider: null, problem: 'مفتاح Resend وعنوان المرسل غير مضافين (RESEND_API_KEY, MAIL_FROM)' }
  }
  if (c === 'push') {
    if (vapidKeys()) return { configured: true, provider: 'webpush' }
    if (dev()) return { configured: true, provider: 'outbox' }
    return { configured: false, provider: null, problem: 'مفاتيح VAPID غير مضافة (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT)' }
  }
  if (envVar('TAQNYAT_API_KEY') && envVar('SMS_SENDER')) return { configured: true, provider: 'taqnyat' }
  if (dev()) return { configured: true, provider: 'outbox' }
  return { configured: false, provider: null, problem: 'مفتاح تقنيات واسم المرسل غير مضافين (TAQNYAT_API_KEY, SMS_SENDER)' }
}

/** مفاتيح VAPID لإشعارات المتصفح — المفتاح العام يُعطى للمتصفح، والخاص يبقى سرّاً */
export function vapidKeys() {
  const publicKey = envVar('VAPID_PUBLIC_KEY'), privateKey = envVar('VAPID_PRIVATE_KEY'), subject = envVar('VAPID_SUBJECT')
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null
}

/** إشعار لكل أجهزة المتدرب المشتركة — الاشتراك المنتهي يُحذف */
export async function sendPushTo(learnerId: string, data: { title: string; body: string; url: string; tag?: string; icon?: string }, kind: string): Promise<{ ok: boolean; error?: string; id: string }> {
  const st = channelState('push')
  const subs = await db.select().from(s.pushSubscriptions).where(eq(s.pushSubscriptions.learnerId, learnerId))
  const row = { id: randomUUID(), channel: 'push' as const, to: `${subs.length} جهاز`, subject: data.title, body: `${data.body}\n${data.url}`, kind, provider: st.provider ?? 'none' }
  if (!subs.length) { await db.insert(s.messageLog).values({ ...row, status: 'failed', error: 'لا أجهزة مشتركة' }); return { ok: false, error: 'لا أجهزة مشتركة', id: row.id } }
  if (!st.configured) { await db.insert(s.messageLog).values({ ...row, status: 'failed', error: st.problem }); return { ok: false, error: 'القناة غير مربوطة', id: row.id } }
  if (st.provider === 'outbox') { await db.insert(s.messageLog).values({ ...row, status: 'outbox' }); return { ok: true, id: row.id } }
  const { sendPush } = await import('./webpush')
  let ok = 0
  let err = ''
  for (const sub of subs) {
    const r = await sendPush(sub, data, vapidKeys()!).catch((e) => ({ ok: false as const, gone: false, error: String(e) }))
    if (r.ok) ok++
    else { err = r.error; if (r.gone) await db.delete(s.pushSubscriptions).where(eq(s.pushSubscriptions.id, sub.id)) }
  }
  await db.insert(s.messageLog).values({ ...row, status: ok ? 'sent' : 'failed', error: ok ? '' : err.slice(0, 300) })
  return ok ? { ok: true, id: row.id } : { ok: false, error: 'تعذّر الإرسال', id: row.id }
}

export const channelSettings = () => getSetting<ChannelSettings>('channels', DEFAULT_CHANNELS)
export const saveChannelSettings = (v: ChannelSettings) => setSetting('channels', v)

/** هل القناة متاحة للمتدربين الآن؟ */
export async function channelOpen(c: Channel) {
  const st = channelState(c)
  const set = await channelSettings()
  return st.configured && (c === 'email' ? set.emailEnabled : c === 'sms' ? set.smsEnabled : set.pushEnabled)
}

type Message = { channel: Channel; to: string; subject?: string; text: string; html?: string; kind: string; secret?: string; headers?: Record<string, string> }

/** يرسل ويسجّل. السرّ (مثل رمز التحقق) يُخفى من السجل في الإنتاج. */
export async function send(m: Message): Promise<{ ok: boolean; error?: string; id: string }> {
  const st = channelState(m.channel)
  const logBody = m.secret && !dev() ? m.text.replaceAll(m.secret, '••••••') : m.text
  const row = { id: randomUUID(), channel: m.channel, to: m.to, subject: m.subject ?? '', body: logBody, kind: m.kind, provider: st.provider ?? 'none' }
  if (!st.configured) {
    await db.insert(s.messageLog).values({ ...row, status: 'failed', error: st.problem })
    return { ok: false, error: 'القناة غير مربوطة', id: row.id }
  }
  if (st.provider === 'outbox') {
    await db.insert(s.messageLog).values({ ...row, status: 'outbox' })
    return { ok: true, id: row.id }
  }
  try {
    let providerId = ''
    if (st.provider === 'resend') {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${envVar('RESEND_API_KEY')}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: envVar('MAIL_FROM'), to: [m.to], subject: m.subject, text: m.text, html: m.html, headers: m.headers }),
      })
      if (!r.ok) throw new Error(`resend ${r.status}: ${(await r.text()).slice(0, 200)}`)
      providerId = ((await r.json()) as { id?: string }).id ?? ''
    } else {
      const r = await fetch('https://api.taqnyat.sa/v1/messages', {
        method: 'POST',
        headers: { authorization: `Bearer ${envVar('TAQNYAT_API_KEY')}`, 'content-type': 'application/json' },
        body: JSON.stringify({ recipients: [m.to.replace(/^\+/, '')], body: m.text, sender: envVar('SMS_SENDER') }),
      })
      if (!r.ok) throw new Error(`taqnyat ${r.status}: ${(await r.text()).slice(0, 200)}`)
      providerId = String(((await r.json()) as { messageId?: string | number }).messageId ?? '')
    }
    await db.insert(s.messageLog).values({ ...row, status: 'sent', providerId })
    return { ok: true, id: row.id }
  } catch (e) {
    await db.insert(s.messageLog).values({ ...row, status: 'failed', error: String((e as Error).message).slice(0, 300) })
    return { ok: false, error: 'تعذّر الإرسال — حاول بعد قليل', id: row.id }
  }
}
