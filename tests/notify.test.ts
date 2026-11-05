/* الرسائل الآلية: المنطق النقي، ثم المحرّك كاملاً على قاعدة مؤقتة بوقت مزيّف. */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { DEFAULT_NOTIFY, fill, leftLabel, mergeNotify, reminderDue } from '../src/lib/notify'

const dir = mkdtempSync(join(tmpdir(), 'naf-notify-'))
process.env.DATABASE_URL = `file:${join(dir, 't.db')}`

test('تعبئة المتغيرات — الغائب فارغ', () => {
  assert.equal(fill('أهلاً {{name}} في {{ course }}{{x}}', { name: 'سارة', course: 'الإثبات' }), 'أهلاً سارة في الإثبات')
})

test('صيغ الوقت المتبقي', () => {
  assert.equal(leftLabel(7 * 1440), 'بعد أسبوع')
  assert.equal(leftLabel(1440), 'غداً')
  assert.equal(leftLabel(2 * 1440), 'بعد يومين')
  assert.equal(leftLabel(60), 'بعد ساعة')
  assert.equal(leftLabel(180), 'بعد 3 ساعات')
  assert.equal(leftLabel(10), 'بعد 10 دقائق')
})

test('استحقاق التذكير: في وقته، لا متأخراً، ولا لمن سجّل بعده', () => {
  const start = '2026-12-10T18:00:00.000Z'
  const enrolled = '2026-11-01T00:00:00.000Z'
  assert.equal(reminderDue(start, 1440, new Date('2026-12-09T17:59:00Z'), enrolled).due, false)
  assert.deepEqual(reminderDue(start, 1440, new Date('2026-12-09T18:03:00Z'), enrolled), { due: true, at: '2026-12-09T18:00:00.000Z' })
  /* فات بأكثر من مهلة السماح (6 ساعات لتذكير اليوم) */
  assert.equal(reminderDue(start, 1440, new Date('2026-12-10T01:00:00Z'), enrolled).due, false)
  /* سجّل بعد موعد تذكير الأسبوع */
  assert.equal(reminderDue(start, 7 * 1440, new Date('2026-12-03T18:05:00Z'), '2026-12-03T18:01:00Z').due, false)
  /* بدأت الجلسة */
  assert.equal(reminderDue(start, 10, new Date('2026-12-10T18:00:30Z'), enrolled).due, false)
})

test('دمج الإعداد المخزّن مع الافتراضي', () => {
  const m = mergeNotify({ inactiveDays: 3, templates: { halfway: { ...DEFAULT_NOTIFY.templates.halfway, enabled: false } } as never })
  assert.equal(m.inactiveDays, 3)
  assert.equal(m.templates.halfway.enabled, false)
  assert.equal(m.templates.enrolled.subject, DEFAULT_NOTIFY.templates.enrolled.subject)
})

/* ───────── المحرّك ───────── */
let e: typeof import('../src/server/notify/engine')
let db: typeof import('../src/server/db')['db']
let s: typeof import('../src/server/db')['schema']
const START = '2026-12-10T15:00:00.000Z'

before(async () => {
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  ;({ db, schema: s } = await import('../src/server/db'))
  await migrate(db, { migrationsFolder: './migrations' })
  e = await import('../src/server/notify/engine')
  const { setSetting } = await import('../src/server/settings')
  await setSetting('channels', { emailEnabled: true, smsEnabled: true })
  await db.insert(s.courses).values({ id: 'c1', slug: 'c1', title: 'صياغة~3 العقود', status: 'open', price: 100000, previewToken: 'x', mode: 'live' })
  await db.insert(s.modules).values({ id: 'm1', courseId: 'c1', title: 'و', sortOrder: 0 })
  await db.insert(s.lessons).values([
    { id: 'L1', moduleId: 'm1', title: 'الجلسة الأولى', type: 'live', minutes: 90, sortOrder: 0, startsAt: START, endsAt: '2026-12-10T16:30:00.000Z' },
    { id: 'L2', moduleId: 'm1', title: 'درس مجدول', type: 'article', minutes: 10, sortOrder: 1, drip: { mode: 'days', date: null, days: 3 } },
  ])
  await db.insert(s.learners).values([
    { id: 'a', name: 'سارة أحمد', email: 'sara@x.sa', phone: '+966500000001' },
    { id: 'b', name: 'خالد', email: 'khalid@x.sa' },
  ])
  await db.insert(s.enrollments).values([
    { id: 'ea', learnerId: 'a', courseId: 'c1', source: 'manual', createdAt: '2026-11-20T00:00:00.000Z' },
    /* سجّل بعد موعد تذكير الأسبوع */
    { id: 'eb', learnerId: 'b', courseId: 'c1', source: 'manual', createdAt: '2026-12-05T00:00:00.000Z' },
  ])
})

const rowsOf = (event: string) => db.select().from(s.notifications).where(eq(s.notifications.event, event))

test('تذكير الأسبوع لمن سجّل قبله فقط، ولا يتكرر', async () => {
  const t = new Date('2026-12-03T15:02:00Z')
  const r1 = await e.runNotifications(t)
  assert.equal(r1.problem, undefined)
  const rem = await rowsOf('session_reminder')
  assert.equal(rem.length, 1)
  assert.equal(rem[0].to, 'sara@x.sa')
  assert.equal(rem[0].status, 'sent')
  const r2 = await e.runNotifications(new Date('2026-12-03T15:07:00Z'))
  assert.equal(r2.queued, 0)
})

test('تغيير موعد الجلسة يُبطل القديم ويجدول الجديد', async () => {
  /* تذكير الساعة بالبريد والجوال قبل الموعد الأصلي — نُدرجه ثم ننقل الجلسة قبل إرساله */
  const cfg = await e.notifySettings()
  await e.planScan(new Date('2026-12-10T14:01:00Z'), cfg)
  const pending = (await rowsOf('session_reminder')).filter((r) => r.status === 'pending')
  /* تذكير الساعة: سارة بالبريد والجوال، وخالد بالبريد (لا جوال له) */
  assert.equal(pending.length, 3)
  await db.update(s.lessons).set({ startsAt: '2026-12-11T15:00:00.000Z', endsAt: '2026-12-11T16:30:00.000Z' }).where(eq(s.lessons.id, 'L1'))
  const r = await e.dispatch(new Date('2026-12-10T14:02:00Z'))
  assert.equal(r.sent, 0)
  const after = await rowsOf('session_reminder')
  assert.ok(after.filter((x) => x.status === 'cancelled').every((x) => x.error === 'تغيّر موعد الجلسة'))
  assert.equal(after.filter((x) => x.status === 'pending').length, 0)
  /* الموعد الجديد: تذكير اليوم يُجدول للاثنين */
  await e.runNotifications(new Date('2026-12-10T15:01:00Z'))
  const fresh = (await rowsOf('session_reminder')).filter((x) => String(x.ref.startsAt).startsWith('2026-12-11') && x.status === 'sent')
  assert.deepEqual(fresh.map((x) => x.to).sort(), ['khalid@x.sa', 'sara@x.sa'])
})

test('الرسالة المُرسلة بالقالب والمتغيرات، والجوال بنصه', async () => {
  const log = await db.select().from(s.messageLog)
  const mail = log.find((m) => m.kind === 'session_reminder' && m.channel === 'email')!
  assert.match(mail.subject, /الجلسة الأولى/)
  assert.match(mail.body, /صياغة العقود/)
  assert.doesNotMatch(mail.body, /~3|\{\{/)
})

test('الفتح المتدرّج: بعد 3 أيام من التسجيل', async () => {
  await e.runNotifications(new Date('2026-11-23T00:10:00Z'))
  const d = await rowsOf('drip_unlocked')
  assert.equal(d.length, 1)
  assert.equal(d[0].to, 'sara@x.sa')
})

test('التسجيل والإكمال: رسائل فورية، ومن ألغى اشتراكه لا تصله رسائل التحفيز', async () => {
  await e.onEnrolled('ea')
  const en = await rowsOf('enrolled')
  assert.deepEqual(en.map((x) => `${x.channel}:${x.status}`).sort(), ['email:sent', 'push:skipped', 'sms:sent'])
  const { setOptout } = await import('../src/server/notify/optout')
  await setOptout('sara@x.sa', true)
  await db.insert(s.lessonProgress).values({ learnerId: 'a', lessonId: 'L2', courseId: 'c1', completedAt: new Date().toISOString() })
  await e.onProgress('a', 'c1')
  const half = await rowsOf('halfway')
  assert.equal(half[0].status, 'skipped')
  assert.equal(half[0].error, 'ألغى الاشتراك')
})

test('القالب الموقوف يُتخطّى، والتسجيل الملغى يُلغي رسائله', async () => {
  const { setSetting } = await import('../src/server/settings')
  const cfg = await e.notifySettings()
  await setSetting('notify', { ...cfg, templates: { ...cfg.templates, session_followup: { ...cfg.templates.session_followup, enabled: false } } })
  const r = await e.runNotifications(new Date('2026-12-11T17:31:00Z'))
  assert.equal((await rowsOf('session_followup')).length, 0, 'لا يُجدول ما هو موقوف')
  assert.equal(r.problem, undefined)
  await db.update(s.enrollments).set({ status: 'canceled' }).where(eq(s.enrollments.id, 'eb'))
  await db.insert(s.notifications).values({ id: 'n1', key: 'manual-test', event: 'drip_unlocked', channel: 'email', to: 'khalid@x.sa', learnerId: 'b', courseId: 'c1', ref: { lessonId: 'L2' }, sendAt: '2026-12-01T00:00:00.000Z' })
  await e.dispatch(new Date('2026-12-12T00:00:00Z'), { keys: ['manual-test'] })
  const [n] = await db.select().from(s.notifications).where(eq(s.notifications.id, 'n1'))
  assert.equal(n.status, 'cancelled')
})

test('السلة المتروكة: آخر طلب غير مدفوع فقط، ويُلغى إن سجّل', async () => {
  await db.insert(s.learners).values({ id: 'c', name: 'نورة', email: 'noura@x.sa' })
  const buyer = { name: 'نورة', email: 'noura@x.sa', phone: '', org: '', vatNumber: '' }
  const base = { learnerId: 'c', buyer, subtotal: 100000, total: 100000, vat: 13043, token: 't' }
  await db.insert(s.orders).values([
    { ...base, id: 'o1', number: 'NA-1', status: 'canceled', createdAt: '2026-12-01T09:00:00.000Z' },
    { ...base, id: 'o2', number: 'NA-2', status: 'pending', createdAt: '2026-12-01T10:00:00.000Z', token: 't2' },
  ] as never)
  await db.insert(s.orderItems).values([
    { id: 'i1', orderId: 'o1', courseId: 'c1', title: 'د', tierName: '', quantity: 1, unitPrice: 100000, listPrice: 100000, lineTotal: 100000 },
    { id: 'i2', orderId: 'o2', courseId: 'c1', title: 'د', tierName: '', quantity: 1, unitPrice: 100000, listPrice: 100000, lineTotal: 100000 },
  ] as never)
  await e.runNotifications(new Date('2026-12-01T11:05:00Z'))
  const c1 = await rowsOf('cart_abandoned')
  assert.deepEqual(c1.map((x) => `${x.ref.orderId}:${x.status}`), ['o2:sent'])
  /* سجّل قبل تذكير اليوم التالي — يُلغى */
  await db.insert(s.enrollments).values({ id: 'ec', learnerId: 'c', courseId: 'c1', source: 'manual' })
  await e.runNotifications(new Date('2026-12-02T10:05:00Z'))
  const c2 = (await rowsOf('cart_abandoned')).find((x) => x.key === 'cart:o2:1440')!
  assert.equal(c2.status, 'cancelled')
})

test('فتح التسجيل يُبلغ قائمة الاهتمام مرة واحدة', async () => {
  await db.insert(s.courses).values({ id: 'c2', slug: 'c2', title: 'قريباً', status: 'soon', price: 0, free: true, previewToken: 'y' })
  await db.insert(s.interest).values({ id: 'int1', courseId: 'c2', kind: 'notify_open', name: 'ريم', email: 'reem@x.sa' })
  await e.runNotifications(new Date('2026-12-03T00:00:00Z'))
  assert.equal((await rowsOf('registration_open')).length, 0)
  await db.update(s.courses).set({ status: 'open' }).where(eq(s.courses.id, 'c2'))
  await e.runNotifications(new Date('2026-12-03T00:05:00Z'))
  await e.runNotifications(new Date('2026-12-03T00:10:00Z'))
  const r = await rowsOf('registration_open')
  assert.deepEqual(r.map((x) => x.status), ['sent'])
  const [i] = await db.select().from(s.interest).where(eq(s.interest.id, 'int1'))
  assert.ok(i.notifiedAt)
})
