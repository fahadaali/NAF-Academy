/* الأوقات والرسائل بعد فحص 2026-11-08: تطبيع الأوقات إلى UTC، ومقارنة المحرّك بالقيمة لا بالنص،
   وبريد «التسجيل جاهز» لا يخرج قبل انتهاء الجلسة، والدفعة المحذوفة لا مواعيد لها. */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { cohortInput, promotionInput } from '../src/admin/schemas'

const dir = mkdtempSync(join(tmpdir(), 'naf-a3notify-'))
process.env.DATABASE_URL = `file:${join(dir, 't.db')}`

test('الأوقات من المحرّر تُخزَّن UTC — `+03:00` يصير `Z` بالقيمة نفسها', () => {
  const k = cohortInput.parse({
    title: 'دفعة', status: 'open', startsAt: '2026-12-06T18:00:00+03:00', endsAt: null, seatsTotal: null, seatsTaken: 0, city: '', venue: '',
    sessions: [{ lessonId: '00000000-0000-4000-8000-000000000000', startsAt: '2026-12-07T09:30:00+03:00', endsAt: '2026-12-07T11:00:00.000Z', joinUrl: '', location: '' }],
  })
  assert.equal(k.startsAt, '2026-12-06T15:00:00.000Z')
  assert.equal(k.sessions[0].startsAt, '2026-12-07T06:30:00.000Z')
  assert.equal(k.sessions[0].endsAt, '2026-12-07T11:00:00.000Z')
  assert.equal(k.endsAt, null)
  const p = promotionInput.safeParse({ startsAt: 'غد', endsAt: null })
  assert.equal(p.success, false)
})

let e: typeof import('../src/server/notify/engine')
let db: typeof import('../src/server/db')['db']
let s: typeof import('../src/server/db')['schema']
const H = 3600e3

before(async () => {
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  ;({ db, schema: s } = await import('../src/server/db'))
  await migrate(db, { migrationsFolder: './migrations' })
  e = await import('../src/server/notify/engine')
  const { setSetting } = await import('../src/server/settings')
  await setSetting('channels', { emailEnabled: true, smsEnabled: false })
  await db.insert(s.courses).values({ id: 'c1', slug: 'c1', title: 'دورة', status: 'open', price: 100000, previewToken: 'x', mode: 'live' })
  await db.insert(s.modules).values({ id: 'm1', courseId: 'c1', title: 'و', sortOrder: 0 })
  const soon = Date.now() + H
  await db.insert(s.lessons).values([
    /* قيمة قديمة من البذرة بتوقيت الرياض = 15:00Z */
    { id: 'legacy', moduleId: 'm1', title: 'جلسة قديمة الصيغة', type: 'live', minutes: 60, sortOrder: 0, startsAt: '2027-03-10T18:00:00+03:00' },
    { id: 'rec', moduleId: 'm1', title: 'جلسة لها تسجيل', type: 'live', minutes: 60, sortOrder: 1, startsAt: new Date(soon).toISOString(), endsAt: new Date(soon + H).toISOString() },
  ])
  await db.insert(s.learners).values({ id: 'a', name: 'سارة', email: 'sara@x.sa' })
  await db.insert(s.enrollments).values({ id: 'ea', learnerId: 'a', courseId: 'c1', source: 'manual', createdAt: '2026-01-01T00:00:00.000Z' })
})

test('تذكير اليوم لجلسة مخزّنة بإزاحة +03:00 يخرج في موعده لا بعده بثلاث ساعات', async () => {
  const cfg = await e.notifySettings()
  const only = { ...cfg, sessionOffsets: [{ minutes: 1440, email: true, sms: false }] }
  /* قبل الموعد بيوم ودقيقتين (UTC) — نصّياً «18:00+03:00» يقع خارج النافذة المنتهية 15:02Z */
  await e.planScan(new Date('2027-03-09T15:02:00Z'), only)
  const rem = await db.select().from(s.notifications).where(eq(s.notifications.event, 'session_reminder'))
  assert.equal(rem.length, 1)
  assert.equal(rem[0].sendAt, '2027-03-09T15:00:00.000Z')
})

test('«التسجيل جاهز» يُجدول لنهاية الجلسة، ويُؤجَّل إن تأخر موعدها', async () => {
  await e.onRecordingReady('rec', null)
  const [r] = await db.select().from(s.notifications).where(eq(s.notifications.event, 'recording_ready'))
  assert.ok(r)
  assert.equal(r.status, 'pending', 'لا يخرج قبل انتهاء الجلسة')
  const end = Date.now() + 2 * H
  assert.ok(Math.abs(Date.parse(r.sendAt) - end) < 60e3, 'موعده نهاية الجلسة')
  /* الجلسة نُقلت ساعتين بعد الجدولة: عند موعده القديم يُؤجَّل لا يُرسل */
  await db.update(s.lessons).set({ startsAt: new Date(Date.now() + 3 * H).toISOString(), endsAt: new Date(Date.now() + 4 * H).toISOString() }).where(eq(s.lessons.id, 'rec'))
  const d1 = await e.dispatch(new Date(end + 2 * 60e3), { ids: [r.id] })
  assert.equal(d1.sent, 0)
  const [later] = await db.select().from(s.notifications).where(eq(s.notifications.id, r.id))
  assert.equal(later.status, 'pending')
  assert.ok(Date.parse(later.sendAt) > Date.now() + 4 * H - 60e3)
  /* بعد النهاية الجديدة يخرج */
  const d2 = await e.dispatch(new Date(Date.now() + 5 * H), { ids: [r.id] })
  assert.equal(d2.sent, 1)
})

test('الدفعة المحذوفة لا مواعيد لها — مسجّلها يتبع مواعيد الدروس', async () => {
  const cohorts = await import('../src/server/cohorts')
  await db.insert(s.cohorts).values({ id: 'kdel', courseId: 'c1', title: 'محذوفة', status: 'open', deletedAt: new Date().toISOString() })
  await db.insert(s.cohortSessions).values({ cohortId: 'kdel', lessonId: 'legacy', startsAt: '2027-04-01T10:00:00.000Z' })
  const m = await cohorts.sessionsOf('kdel')
  assert.equal(m?.size, 0)
  await db.update(s.cohorts).set({ deletedAt: null }).where(eq(s.cohorts.id, 'kdel'))
  assert.equal((await cohorts.sessionsOf('kdel'))?.size, 1)
})
