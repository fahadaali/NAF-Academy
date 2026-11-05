/* الشهادات: الشروط والرمز وترتيب النص (نقية)، ثم الدورة الكاملة على قاعدة مؤقتة: الاستيفاء ← المراجعة ← الإصدار ← PDF ← الإلغاء. */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { DEFAULT_RULES, certCode, evaluateRules, linkedinUrl, mergeDesign } from '../src/lib/certificate'

const dir = mkdtempSync(join(tmpdir(), 'naf-cert-'))
process.env.DATABASE_URL = `file:${join(dir, 't.db')}`
const fonts = existsSync('public/cert-fonts/display-bold.woff2')

const base = { completable: 4, completed: 4, sessions: 4, attended: 3, quizzes: 1, quizzesPassed: 1, assignments: 1, assignmentsAccepted: 1 }

test('الشروط: كلها مستوفاة، والحضور 75%', () => {
  const r = evaluateRules(DEFAULT_RULES, base)
  assert.equal(r.eligible, true)
  assert.deepEqual(r.criteria.map((c) => c.key), ['lessons', 'attendance', 'quizzes', 'assignments'])
})

test('الشروط: نقص شرط واحد يمنع، والشرط الموقوف لا يُحسب', () => {
  assert.equal(evaluateRules(DEFAULT_RULES, { ...base, attended: 2 }).eligible, false)
  assert.equal(evaluateRules(DEFAULT_RULES, { ...base, quizzesPassed: 0 }).eligible, false)
  assert.equal(evaluateRules({ ...DEFAULT_RULES, quizzes: false }, { ...base, quizzesPassed: 0 }).eligible, true)
  assert.equal(evaluateRules({ ...DEFAULT_RULES, enabled: false }, base).eligible, false)
  /* دورة بلا دروس لا تمنح شهادة بلا شروط */
  assert.equal(evaluateRules(DEFAULT_RULES, { completable: 0, completed: 0, sessions: 0, attended: 0, quizzes: 0, quizzesPassed: 0, assignments: 0, assignmentsAccepted: 0 }).eligible, false)
})

test('رمز الشهادة بلا أحرف ملتبسة', () => {
  let i = 0
  const code = certCode((n) => (i++ * 7) % n)
  assert.match(code, /^NAF-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/)
})

test('رابط LinkedIn يحمل الرقم والسنة والشهر', () => {
  const u = new URL(linkedinUrl({ course: 'الإثبات', code: 'NAF-AAAA-BBBB', url: 'https://x.sa/c', issuedAt: '2026-11-05T10:00:00Z' }))
  assert.equal(u.searchParams.get('certId'), 'NAF-AAAA-BBBB')
  assert.equal(u.searchParams.get('issueYear'), '2026')
  assert.equal(u.searchParams.get('issueMonth'), '11')
})

test('دمج القالب: عنصر غائب يأخذ موضعه الافتراضي', () => {
  const d = mergeDesign({ title: 'شهادة', blocks: { name: { x: 40, y: 50, size: 30, show: true } } as never })
  assert.equal(d.blocks.name.x, 40)
  assert.equal(d.blocks.qr.show, true)
})

test('ترتيب المقاطع: الأرقام واللاتينية مقاطع مستقلة بترتيبها المنطقي', async () => {
  const { bidiRuns } = await import('../src/server/certificates/pdf')
  assert.deepEqual(bidiRuns('صدرت في 5 نوفمبر 2026'), [
    { text: 'صدرت في ', ltr: false }, { text: '5', ltr: true }, { text: ' نوفمبر ', ltr: false }, { text: '2026', ltr: true },
  ])
  assert.deepEqual(bidiRuns('الرقم NAF-7K2Q-9MXR.').map((r) => r.text), ['الرقم ', 'NAF-7K2Q-9MXR', '.'])
})

/* ───────── الدورة الكاملة ───────── */
let c: typeof import('../src/server/certificates')
let db: typeof import('../src/server/db')['db']
let s: typeof import('../src/server/db')['schema']

before(async () => {
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  ;({ db, schema: s } = await import('../src/server/db'))
  await migrate(db, { migrationsFolder: './migrations' })
  c = await import('../src/server/certificates')
  await db.insert(s.courses).values({ id: 'c1', slug: 'c1', title: 'نظام~3 الإثبات', status: 'open', price: 0, free: true, hours: 9, previewToken: 'x', certificate: { ...DEFAULT_RULES, attendancePct: 100 } })
  await db.insert(s.modules).values({ id: 'm1', courseId: 'c1', title: 'و', sortOrder: 0 })
  await db.insert(s.lessons).values([
    { id: 'v', moduleId: 'm1', title: 'فيديو', type: 'video', minutes: 10, sortOrder: 0 },
    { id: 'q', moduleId: 'm1', title: 'اختبار', type: 'quiz', minutes: 10, sortOrder: 1 },
    { id: 'l', moduleId: 'm1', title: 'جلسة', type: 'onsite', minutes: 60, sortOrder: 2 },
  ])
  await db.insert(s.learners).values({ id: 'a', name: 'سارة المتدربة', email: 'sara@x.sa' })
  await db.insert(s.enrollments).values({ id: 'e', learnerId: 'a', courseId: 'c1', source: 'manual' })
})

test('لا شهادة قبل استيفاء كل الشروط', async () => {
  await db.insert(s.lessonProgress).values([{ learnerId: 'a', lessonId: 'v', courseId: 'c1', completedAt: new Date().toISOString() }, { learnerId: 'a', lessonId: 'q', courseId: 'c1', completedAt: new Date().toISOString() }])
  assert.equal(await c.checkCertificate('a', 'c1'), null)
  const ev = await c.evaluate('a', 'c1')
  assert.deepEqual(ev!.criteria.map((x) => `${x.key}:${x.met}`), ['lessons:true', 'attendance:false', 'quizzes:true'])
})

test('الاستيفاء يُنشئ طلباً بانتظار المراجعة — مرة واحدة', async () => {
  await db.insert(s.attendance).values({ learnerId: 'a', lessonId: 'l', courseId: 'c1', method: 'qr' })
  const r = await c.checkCertificate('a', 'c1')
  assert.equal(r?.status, 'pending')
  assert.equal(r?.courseTitle, 'نظام الإثبات')
  assert.equal(r?.code, null)
  await c.checkCertificate('a', 'c1')
  assert.equal((await db.select().from(s.certificates)).length, 1)
})

test('الإصدار: رمز فريد، ولقطة القالب، وملف PDF صالح', { skip: !fonts && 'خطوط الشهادة غير مولّدة' }, async () => {
  const [p] = await db.select().from(s.certificates)
  const r = await c.issueCertificate(p.id, 'مراجع')
  assert.equal(r?.status, 'issued')
  assert.match(r!.code!, /^NAF-/)
  assert.ok(r!.design)
  const [row] = await db.select().from(s.certificates).where(eq(s.certificates.id, p.id))
  assert.ok(row.pdfKey)
  const bytes = await c.certificatePdfBytes(row)
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-')
  assert.ok(bytes.length < 200_000, `حجم الملف ${bytes.length}`)
  const found = await c.certificateByCode(row.code!.toLowerCase())
  assert.equal(found?.c.id, p.id)
  /* الإصدار مرة ثانية لا يغيّر الرمز */
  const again = await c.issueCertificate(p.id, 'مراجع')
  assert.equal(again?.code, row.code)
})

test('الاعتماد التلقائي يصدر فوراً', { skip: !fonts && 'خطوط الشهادة غير مولّدة' }, async () => {
  await db.update(s.courses).set({ certificate: { ...DEFAULT_RULES, autoApprove: true, attendancePct: 0 } }).where(eq(s.courses.id, 'c1'))
  await db.insert(s.learners).values({ id: 'b', name: 'خالد', email: 'k@x.sa' })
  await db.insert(s.enrollments).values({ id: 'e2', learnerId: 'b', courseId: 'c1', source: 'manual' })
  await db.insert(s.lessonProgress).values([{ learnerId: 'b', lessonId: 'v', courseId: 'c1', completedAt: new Date().toISOString() }, { learnerId: 'b', lessonId: 'q', courseId: 'c1', completedAt: new Date().toISOString() }])
  const r = await c.checkCertificate('b', 'c1')
  assert.equal(r?.status, 'issued')
  assert.equal(r?.decidedBy, 'اعتماد تلقائي')
})

test('غير المسجّل لا تُنشأ له شهادة', async () => {
  await db.update(s.enrollments).set({ status: 'canceled' }).where(eq(s.enrollments.id, 'e2'))
  await db.delete(s.certificates).where(eq(s.certificates.learnerId, 'b'))
  assert.equal(await c.checkCertificate('b', 'c1'), null)
})
