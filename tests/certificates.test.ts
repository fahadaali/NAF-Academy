/* الشهادات: الشروط والرمز وترتيب النص (نقية)، ثم الدورة الكاملة على قاعدة مؤقتة: الاستيفاء ← المراجعة ← الإصدار ← PDF ← الإلغاء. */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { DEFAULT_RULES, SPLIT_BLOCKS, certCode, evaluateRules, linkedinUrl, mergeDesign } from '../src/lib/certificate'
import { SAMPLE_ID, maskId, normalizeDigits, validNationalId } from '../src/lib/identity'

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

test('رقم الهوية: 10 أرقام تبدأ بـ 1 أو 2 ورقم تحقق صحيح', () => {
  assert.equal(validNationalId(SAMPLE_ID), true)
  assert.equal(validNationalId('1128218466'), true)
  assert.equal(validNationalId('1128218467'), false, 'رقم التحقق')
  assert.equal(validNationalId('3128218466'), false, 'البادئة')
  assert.equal(validNationalId('112821846'), false, 'الطول')
  assert.equal(validNationalId(''), false)
  /* الأرقام العربية والمسافات تُطبَّع قبل الفحص */
  assert.equal(normalizeDigits('١١٢٨ ٢١٨ ٤٦٦'), '1128218466')
  assert.equal(validNationalId('١١٢٨٢١٨٤٦٦'), true)
})

test('رقم الهوية مقنّع في الصفحة العامة', () => {
  assert.equal(maskId('1128218466'), '••••••8466')
  assert.equal(maskId(''), '')
})

test('التخطيط المنقسم: ثنائي دائماً بمواضعه، والقديم مكدّس كما هو', () => {
  const d = mergeDesign({ layout: 'split', bilingual: false })
  assert.equal(d.bilingual, true)
  assert.deepEqual(d.blocks.idNumber, SPLIT_BLOCKS.idNumber)
  const old = mergeDesign({ title: 'شهادة' })
  assert.equal(old.layout, 'stacked')
  assert.equal(old.en.idLabel, 'ID No.:')
  assert.equal(mergeDesign({ layout: 'x' as never }).layout, 'stacked')
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

test('بلا رقم هوية لا تصدر الشهادة — تبقى بانتظار المراجعة', async () => {
  const [p] = await db.select().from(s.certificates)
  const r = await c.issueCertificate(p.id, 'مراجع')
  assert.equal(r?.status, 'pending')
  assert.equal(r?.code, null)
})

test('الإصدار: رمز فريد، ولقطة القالب ورقم الهوية، وملف PDF صالح', { skip: !fonts && 'خطوط الشهادة غير مولّدة' }, async () => {
  await db.update(s.learners).set({ nationalId: SAMPLE_ID }).where(eq(s.learners.id, 'a'))
  const [p] = await db.select().from(s.certificates)
  const r = await c.issueCertificate(p.id, 'مراجع')
  assert.equal(r?.status, 'issued')
  assert.equal(r?.nationalId, SAMPLE_ID)
  /* الصفحة العامة تعرضه مقنّعاً */
  assert.equal((await c.viewData(r!)).idNumber, maskId(SAMPLE_ID))
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

test('الاعتماد التلقائي ينتظر رقم الهوية ثم يصدر فور إضافته', { skip: !fonts && 'خطوط الشهادة غير مولّدة' }, async () => {
  await db.update(s.courses).set({ certificate: { ...DEFAULT_RULES, autoApprove: true, attendancePct: 0 } }).where(eq(s.courses.id, 'c1'))
  await db.insert(s.learners).values({ id: 'b', name: 'خالد', email: 'k@x.sa' })
  await db.insert(s.enrollments).values({ id: 'e2', learnerId: 'b', courseId: 'c1', source: 'manual' })
  await db.insert(s.lessonProgress).values([{ learnerId: 'b', lessonId: 'v', courseId: 'c1', completedAt: new Date().toISOString() }, { learnerId: 'b', lessonId: 'q', courseId: 'c1', completedAt: new Date().toISOString() }])
  const r = await c.checkCertificate('b', 'c1')
  assert.equal(r?.status, 'pending')
  await db.update(s.learners).set({ nationalId: '1128218466' }).where(eq(s.learners.id, 'b'))
  assert.equal(await c.issueAwaitingId('b'), 1)
  const [row] = await db.select().from(s.certificates).where(eq(s.certificates.learnerId, 'b'))
  assert.equal(row.status, 'issued')
  assert.equal(row.decidedBy, 'اعتماد تلقائي')
})

test('رقم الهوية لحساب واحد — والفارغ لا يتعارض', async () => {
  const id = await import('../src/server/identity')
  /* 'a' يحمل SAMPLE_ID منذ اختبار الإصدار */
  assert.equal(await id.nationalIdOwner(SAMPLE_ID, 'b'), 'a')
  assert.equal(await id.nationalIdOwner(SAMPLE_ID, 'a'), null)
  assert.equal(await id.nationalIdOwner('', 'b'), null)
  assert.deepEqual(await id.writeIdentity('b', { nationalId: SAMPLE_ID }), { ok: false, error: id.NATIONAL_ID_TAKEN })
  /* الفهرس الفريد يحرس ولو تجاوزت الكتابة الفحص */
  await assert.rejects(db.update(s.learners).set({ nationalId: SAMPLE_ID }).where(eq(s.learners.id, 'b')), (e) => id.isNationalIdConflict(e))
  await db.insert(s.learners).values([{ id: 'e1', name: 'بلا رقم', email: 'e1@x.sa' }, { id: 'e2', name: 'بلا رقم', email: 'e2@x.sa' }])
})

test('ملف PDF بالتخطيط المنقسم ورقم الهوية', { skip: !fonts && 'خطوط الشهادة غير مولّدة' }, async () => {
  const { certificatePdf } = await import('../src/server/certificates/pdf')
  const bytes = await certificatePdf(mergeDesign({ layout: 'split' }), { name: 'سارة', course: 'الإثبات', hours: 3, date: '5 نوفمبر 2026', hijri: '', code: 'NAF-AAAA-BBBB', verifyUrl: 'https://x.sa/c', nameEn: 'Sara', dateEn: '5 November 2026', idNumber: SAMPLE_ID },
    { name: 'أكاديمية', tagline: '', companyName: '', showName: true, logo: null, full: false })
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-')
})

test('غير المسجّل لا تُنشأ له شهادة', async () => {
  await db.update(s.enrollments).set({ status: 'canceled' }).where(eq(s.enrollments.id, 'e2'))
  await db.delete(s.certificates).where(eq(s.certificates.learnerId, 'b'))
  assert.equal(await c.checkCertificate('b', 'c1'), null)
})

test('ترحيل 0022: القالب الثنائي افتراضياً بنصوص القالب القائم وموقّعيه، ومرة واحدة', async () => {
  const { readFileSync } = await import('node:fs')
  const { sql } = await import('drizzle-orm')
  const { SPLIT_BLOCKS } = await import('../src/lib/certificate')
  const ID = '4009e14e-7009-4d28-b3c9-64c2581e6099'
  /* قاعدة قائمة: قالب افتراضي معدَّل (القاعدة المؤقتة هنا فارغة القوالب فلم يُطبَّق عليها شيء) */
  assert.equal((await db.select().from(s.certificateTemplates)).length, 0)
  await db.insert(s.certificateTemplates).values({ id: 't-old', name: 'قالبنا', isDefault: true, design: mergeDesign({ title: 'شهادة حضور', signatories: [{ name: 'فهد', title: 'المدير', signatureId: null }] }) })
  const run = async () => { for (const q of readFileSync('migrations/0022_split_default_certificate.sql', 'utf8').split('--> statement-breakpoint')) await db.run(sql.raw(q)) }
  await run()
  await run()
  const rows = await db.select().from(s.certificateTemplates)
  assert.equal(rows.length, 2)
  const t = rows.find((r) => r.id === ID)!
  assert.equal(t.isDefault, true)
  assert.equal(rows.find((r) => r.id === 't-old')!.isDefault, false)
  const d = mergeDesign(t.design)
  assert.equal(d.layout, 'split')
  assert.equal(d.title, 'شهادة حضور')
  assert.equal(d.signatories[0].name, 'فهد')
  assert.deepEqual(d.blocks, SPLIT_BLOCKS)
})
