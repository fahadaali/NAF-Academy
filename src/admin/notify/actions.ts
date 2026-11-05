'use server'
/* الرسائل الآلية في اللوحة — حفظ القوالب والتوقيتات، والمعاينة، والإرسال التجريبي، وإدارة الطابور. */
import { revalidatePath } from 'next/cache'
import { emailBrand } from '@/server/brand'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema as s } from '@/server/db'
import { requirePermission } from '@/server/auth'
import { audit } from '@/server/audit'
import { setSetting } from '@/server/settings'
import { send } from '@/server/notify/channels'
import { renderEmail } from '@/server/notify/templates'
import { runNotifications } from '@/server/notify/engine'
import { siteUrl } from '@/server/site'
import { EVENTS, EVENT_META, fill, type EventKey, type NotifySettings, type Template } from '@/lib/notify'
import { formatDay, formatHijri, formatTime, formatWeekday } from '@/lib/dates'
import { inList } from '@/server/db/limits'

const tpl = z.object({
  enabled: z.boolean(),
  subject: z.string().trim().min(1, 'العنوان مطلوب').max(200),
  heading: z.string().trim().min(1, 'العنوان الرئيسي مطلوب').max(200),
  body: z.string().trim().min(1, 'نص الرسالة مطلوب').max(5000),
  cta: z.string().trim().max(60),
  cta2: z.string().trim().max(60).default(''),
  sms: z.string().trim().max(320),
})
const settingsInput = z.object({
  templates: z.object(Object.fromEntries(EVENTS.map((e) => [e, tpl])) as Record<EventKey, typeof tpl>),
  sessionOffsets: z.array(z.object({ minutes: z.number().int().min(5).max(30 * 1440), email: z.boolean(), sms: z.boolean() })).max(8),
  followupDelay: z.number().int().min(0).max(7 * 1440),
  inactiveDays: z.number().int().min(0).max(90),
  saleHours: z.number().int().min(0).max(14 * 24),
  cartDelays: z.array(z.number().int().min(15).max(14 * 1440)).max(4),
  cartCoupon: z.string().trim().toUpperCase().max(40),
})

export async function saveNotify(raw: NotifySettings): Promise<{ ok: boolean; errors?: Record<string, string> }> {
  const st = await requirePermission('notify.manage')
  const p = settingsInput.safeParse(raw)
  if (!p.success) return { ok: false, errors: Object.fromEntries(p.error.issues.map((i) => [i.path.join('.'), i.message])) }
  const v = { ...p.data, sessionOffsets: [...p.data.sessionOffsets].sort((a, b) => b.minutes - a.minutes), cartDelays: [...new Set(p.data.cartDelays)].sort((a, b) => a - b) }
  await setSetting('notify', v)
  await audit(st.name, 'update', 'settings', 'notify', 'قوالب الرسائل وتوقيتاتها', v)
  revalidatePath('/admin/notifications')
  return { ok: true }
}

function sample(site: string): Record<string, string> {
  const at = new Date(Date.now() + 864e5).toISOString()
  const w = `${formatWeekday(at)} ${formatDay(at)} · ${formatTime(at)} (${formatHijri(at)})`
  return {
    name: 'سارة', course: 'صياغة العقود التجارية', lesson: 'جلسة الحالات العملية', when: w, starts: w, left: 'غداً',
    location: 'القاعة الكبرى — الرياض', link: `${site}/learn`, calendar: `${site}/courses`, pct: '50%',
    price: '2,490 ر.س', ends: w, coupon: 'WELCOME10', order: 'NA-2026-000123', code: 'NAF-7K2Q-91',
    total: '7,470 ر.س', amount: '2,490 ر.س', seats: '3 مقاعد',
    cohort: 'الدفعة الثالثة — ربيع 2027', until: w,
  }
}

async function compose(event: EventKey, t: Template, site: string, forceDark = false) {
  const v = sample(site)
  const brand = await emailBrand(site)
  const meta = EVENT_META[event]
  const { html, text } = renderEmail({
    site, brand, forceDark, heading: fill(t.heading, v), body: fill(t.body, v), preheader: fill(t.subject, v),
    facts: meta.facts.map(([k, x]) => [k, v[x] ?? ''] as [string, string]),
    cta: t.cta ? { label: fill(t.cta, v), href: v.link } : undefined,
    cta2: meta.cta2Var && t.cta2 ? { label: fill(t.cta2, v), href: `${site}/learn` } : undefined,
    unsubscribe: meta.category !== 'transactional' ? `${site}/unsubscribe` : undefined,
  })
  return { subject: fill(t.subject, v), html, text, sms: meta.sms ? fill(t.sms, v) : '' }
}

export async function previewNotify(event: EventKey, t: Template, dark: boolean) {
  await requirePermission('notify.manage')
  if (!EVENTS.includes(event)) throw new Error('حدث غير معروف')
  return await compose(event, tpl.parse({ ...t, subject: t.subject || '—', heading: t.heading || '—', body: t.body || '—' }), siteUrl() ?? '', dark)
}

export async function sendTest(event: EventKey, t: Template, to: string, channel: 'email' | 'sms'): Promise<{ ok: boolean; error?: string }> {
  const st = await requirePermission('notify.manage')
  const site = siteUrl()
  if (!site) return { ok: false, error: 'SITE_URL غير مضبوط' }
  const dest = z.string().trim().min(5).max(200).safeParse(to)
  if (!dest.success) return { ok: false, error: 'وجهة غير صالحة' }
  const c = await compose(event, tpl.parse(t), site)
  const r = channel === 'email'
    ? await send({ channel, to: dest.data, subject: `[تجربة] ${c.subject}`, text: c.text, html: c.html, kind: 'test' })
    : await send({ channel, to: dest.data, text: c.sms, kind: 'test' })
  await audit(st.name, 'test', 'notify', event, dest.data)
  return r.ok ? { ok: true } : { ok: false, error: r.error }
}

export async function runNow(): Promise<{ ok: boolean; text: string }> {
  const st = await requirePermission('notify.manage')
  const r = await runNotifications()
  await audit(st.name, 'run', 'notify', '-', `جدولة ${r.queued} · أُرسل ${r.sent}`)
  revalidatePath('/admin/notifications/queue')
  return r.problem ? { ok: false, text: r.problem } : { ok: true, text: `جُدولت ${r.queued} · أُرسلت ${r.sent} · تُخطّيت ${r.skipped} · ستُعاد ${r.retry} · فشلت ${r.failed}` }
}

export async function cancelNotifications(ids: string[]) {
  const st = await requirePermission('notify.manage')
  if (!Array.isArray(ids) || !ids.every((x) => typeof x === 'string')) return { ok: false, n: 0 }
  const r = await db.update(s.notifications).set({ status: 'cancelled', error: `ألغاه ${st.name}`, updatedAt: new Date().toISOString() })
    .where(and(inList(s.notifications.id, ids.slice(0, 200)), eq(s.notifications.status, 'pending'))).returning({ id: s.notifications.id })
  await audit(st.name, 'cancel', 'notify', '-', `${r.length} رسالة`)
  revalidatePath('/admin/notifications/queue')
  return { ok: true, n: r.length }
}

export async function retryNotification(id: string) {
  const st = await requirePermission('notify.manage')
  const r = await db.update(s.notifications).set({ status: 'pending', attempts: 0, error: '', sendAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(and(eq(s.notifications.id, id), inArray(s.notifications.status, ['failed', 'skipped']))).returning({ id: s.notifications.id })
  if (r.length) await audit(st.name, 'retry', 'notify', id, '')
  revalidatePath('/admin/notifications/queue')
  return { ok: !!r.length }
}
