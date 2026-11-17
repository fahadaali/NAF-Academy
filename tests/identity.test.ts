/* الهوية: حساب واحد لشخص واحد — الدوال النقية، ثم القفل على قاعدة مؤقتة: الدروس مقفلة بلا البيانات الإلزامية،
   والتفرّد، وأن الشراء لا يغيّر اسماً مثبّتاً. */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { identityComplete, identityGaps, lockedFields, normalizeDigits, SAMPLE_ID, validArabicName, validEnglishName, validNationalId } from '../src/lib/identity'

const dir = mkdtempSync(join(tmpdir(), 'naf-identity-'))
process.env.DATABASE_URL = `file:${join(dir, 't.db')}`

const full = { name: 'سارة عبدالله', nameEn: 'Sarah Abdullah', nationalId: SAMPLE_ID, phone: '+966550000001' }

test('الاسمان: بحروف لغتهما وكلمتين فأكثر', () => {
  assert.equal(validArabicName('سارة عبدالله'), true)
  assert.equal(validArabicName('عَبْدُ الله'), true, 'التشكيل')
  assert.equal(validArabicName('سارة'), false, 'كلمة واحدة')
  assert.equal(validArabicName('Sarah Abdullah'), false)
  assert.equal(validArabicName('سارة 2'), false)
  assert.equal(validEnglishName("Sarah O'Neil"), true)
  assert.equal(validEnglishName('Sarah'), false)
  assert.equal(validEnglishName('سارة عبدالله'), false)
})

test('رقم الهوية: الطول والبادئة ورقم التحقق، والأرقام العربية', () => {
  assert.equal(validNationalId('1128218466'), true)
  assert.equal(validNationalId('1128218467'), false)
  assert.equal(validNationalId('3000000000'), false)
  assert.equal(normalizeDigits('١١٢٨-٢١٨-٤٦٦'), '1128218466')
})

test('النواقص بالترتيب، والثبات: الرقم متى حُفظ والاسمان متى اكتملت', () => {
  assert.deepEqual(identityGaps(full), [])
  assert.deepEqual(identityGaps({ name: 'sara', nameEn: '', nationalId: '', phone: '' }), ['name', 'nameEn', 'nationalId', 'phone'])
  assert.equal(identityComplete({ ...full, phone: '' }), false)
  assert.deepEqual(lockedFields({ ...full, nameEn: '' }), { nationalId: true, names: false })
  assert.deepEqual(lockedFields(full), { nationalId: true, names: true })
  assert.deepEqual(lockedFields({ ...full, nationalId: '' }), { nationalId: false, names: false })
})

/* ───────── على القاعدة ───────── */
let db: typeof import('../src/server/db')['db']
let s: typeof import('../src/server/db')['schema']

before(async () => {
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  ;({ db, schema: s } = await import('../src/server/db'))
  await migrate(db, { migrationsFolder: './migrations' })
  await db.insert(s.courses).values({ id: 'c1', slug: 'c1', title: 'الإثبات', status: 'open', price: 0, free: true, hours: 2, previewToken: 'x' })
  await db.insert(s.modules).values({ id: 'm1', courseId: 'c1', title: 'و', sortOrder: 0 })
  await db.insert(s.lessons).values([
    { id: 'p', moduleId: 'm1', title: 'مدخل', type: 'article', minutes: 5, sortOrder: 0, preview: true },
    { id: 'v', moduleId: 'm1', title: 'الدرس', type: 'article', minutes: 10, sortOrder: 1 },
  ])
  await db.insert(s.learners).values([{ id: 'a', name: 'sara', email: 'sara@x.sa' }, { id: 'b', ...full, email: 'b@x.sa' }])
  await db.insert(s.enrollments).values([{ id: 'e1', learnerId: 'a', courseId: 'c1', source: 'manual' }, { id: 'e2', learnerId: 'b', courseId: 'c1', source: 'manual' }])
})

const states = async (id: string) => {
  const { learnerCourse } = await import('../src/server/learning')
  const [me] = await db.select().from(s.learners).where(eq(s.learners.id, id))
  const ctx = await learnerCourse('c1', me)
  return { gaps: ctx!.gaps, acc: Object.fromEntries(ctx!.modules[0].lessons.map((l) => [l.id, l.access.state])) }
}

test('المسجّل بلا بياناته: الدروس مقفلة (profile) والمعاينة المجانية مفتوحة', async () => {
  const r = await states('a')
  assert.deepEqual(r.acc, { p: 'open', v: 'profile' })
  assert.deepEqual(r.gaps, ['name', 'nameEn', 'nationalId', 'phone'])
  assert.deepEqual((await states('b')).acc, { p: 'open', v: 'open' })
})

test('حفظ الهوية يفتح الدروس، والرقم والجوال لحساب واحد', async () => {
  const { writeIdentity, NATIONAL_ID_TAKEN, PHONE_TAKEN } = await import('../src/server/identity')
  assert.deepEqual(await writeIdentity('a', { nationalId: SAMPLE_ID }), { ok: false, error: NATIONAL_ID_TAKEN })
  assert.deepEqual(await writeIdentity('a', { phone: full.phone }), { ok: false, error: PHONE_TAKEN })
  assert.deepEqual(await writeIdentity('a', { name: 'خالد محمد', nameEn: 'Khalid Mohammed', nationalId: '1128218466', phone: '+966550000002' }), { ok: true })
  assert.deepEqual((await states('a')).acc, { p: 'open', v: 'open' })
})

test('الشراء والدعوة لا يغيّران اسماً مثبّتاً — ويملآن الفارغ قبل التثبيت', async () => {
  const { upsertLearner } = await import('../src/server/sales')
  const r = await upsertLearner({ name: 'شخص آخر تماماً', nameEn: 'Someone Else', email: 'b@x.sa', phone: '', org: '', vatNumber: '' }, { trusted: true })
  assert.equal(r.name, full.name)
  assert.equal(r.nameEn, full.nameEn)
  await db.insert(s.learners).values({ id: 'c', name: 'c', email: 'c@x.sa' })
  const c = await upsertLearner({ name: 'نورة سعد', nameEn: 'Noura Saad', email: 'c@x.sa', phone: '', org: '', vatNumber: '' })
  assert.equal(c.name, 'نورة سعد')
})
