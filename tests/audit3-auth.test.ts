/* الفحص الثالث — الدخول والصلاحيات:
   - M1: كلمة المرور الصحيحة لا تصفّر عدّاد الأخطاء لمن فعّل التحقق الثنائي؛ يُصفَّر بعد الخطوة الثانية وحدها.
   - M2: زيادة العدّاد ذرّية (الطلبات المتوازية تُحتسب كلها) والقفل من العدد الراجع.
   - رسالة واحدة للبريد غير الموجود والكلمة الخاطئة والحساب المقفل (ولا تحقق من الكلمة أثناء القفل).
   - H5: رمز الدخول يُخفى من عنوان الرسالة المسجّلة كما يُخفى من نصها.
   - M3: غير المالك لا يمنح ما لا يملكه ولا يدير من يعلوه. */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { hashPassword, newTotpSecret, stepOf, totpAt } from '../src/lib/staff-crypto'
import { beyondActor, effective, outranks } from '../src/admin/team/guard'

const dir = mkdtempSync(join(tmpdir(), 'naf-audit3a-'))
process.env.DATABASE_URL = `file:${join(dir, 't.db')}`

let sa: typeof import('../src/server/staff-auth')
let ch: typeof import('../src/server/notify/channels')
let db: typeof import('../src/server/db')['db']
let s: typeof import('../src/server/db')['schema']
const member = async (id: string) => (await db.select().from(s.members).where(eq(s.members.userId, id)))[0]
const PASS = 'a long staff passphrase 2026'
const SECRET = newTotpSecret()

/** رمز لا يطابق النافذة المقبولة (الخطوة وما حولها) */
async function wrongCode(now: number) {
  const near = new Set(await Promise.all([-1, 0, 1].map((d) => totpAt(SECRET, stepOf(now) + d))))
  for (let i = 0; ; i++) { const c = String(i).padStart(6, '0'); if (!near.has(c)) return c }
}

before(async () => {
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  ;({ db, schema: s } = await import('../src/server/db'))
  await migrate(db, { migrationsFolder: './migrations' })
  sa = await import('../src/server/staff-auth')
  ch = await import('../src/server/notify/channels')
  const hash = await hashPassword(PASS)
  const at = Math.floor(Date.now() / 1000)
  await db.insert(s.members).values([
    { userId: 'tfa', email: 'tfa@naf.sa', role: 'content', createdAt: at, passwordHash: hash, totpSecret: SECRET, totpEnabledAt: at },
    { userId: 'plain', email: 'plain@naf.sa', role: 'content', createdAt: at, passwordHash: hash },
    { userId: 'race', email: 'race@naf.sa', role: 'content', createdAt: at, passwordHash: hash },
  ])
})

test('M1: التناوب (كلمة مرور صحيحة + رموز خاطئة) يقفل — العدّاد لا يُصفَّر قبل الخطوة الثانية', async () => {
  const now = Date.now()
  const bad = await wrongCode(now)
  for (let round = 0; round < 3; round++) {
    const r = await sa.checkPassword('tfa@naf.sa', PASS)
    assert.ok(r.ok && r.twoStep)
    const m = await member('tfa')
    const r2 = await sa.checkSecondStep('tfa', m.sessionVersion, bad, now)
    assert.equal(r2.error, 'رمز غير صحيح')
  }
  /* بعد كلمة مرور صحيحة لا يعود العدّاد صفراً */
  assert.ok((await sa.checkPassword('tfa@naf.sa', PASS)).ok)
  assert.equal((await member('tfa')).failedLogins, 3)
  await sa.checkSecondStep('tfa', 0, bad, now)
  await sa.checkSecondStep('tfa', 0, bad, now)
  const locked = await member('tfa')
  assert.equal(locked.failedLogins, 5)
  assert.ok(locked.lockedUntil && locked.lockedUntil > Math.floor(now / 1000))
  /* مقفل: الرمز الصحيح لا يُقبل، وكلمة المرور الصحيحة تلقى الرسالة العامة نفسها */
  assert.equal((await sa.checkSecondStep('tfa', 0, await totpAt(SECRET, stepOf(now)), now)).ok, false)
  const r = await sa.checkPassword('tfa@naf.sa', PASS)
  assert.deepEqual(r, { ok: false, error: sa.WRONG })
})

test('M1: الخطوة الثانية الصحيحة وحدها تصفّر العدّاد', async () => {
  await db.update(s.members).set({ failedLogins: 3, lockedUntil: null }).where(eq(s.members.userId, 'tfa'))
  const now = Date.now()
  assert.ok((await sa.checkPassword('tfa@naf.sa', PASS)).ok)
  assert.equal((await member('tfa')).failedLogins, 3)
  const r = await sa.checkSecondStep('tfa', 0, await totpAt(SECRET, stepOf(now)), now)
  assert.equal(r.ok, true)
  assert.equal((await member('tfa')).failedLogins, 0)
})

test('بلا تحقق ثنائي: كلمة المرور الصحيحة تصفّر العدّاد كما كانت', async () => {
  await db.update(s.members).set({ failedLogins: 2 }).where(eq(s.members.userId, 'plain'))
  const r = await sa.checkPassword('plain@naf.sa', PASS)
  assert.ok(r.ok && !r.twoStep)
  assert.equal((await member('plain')).failedLogins, 0)
})

test('M2: المحاولات المتوازية تُحتسب كلها، والقفل من العدد الراجع', async () => {
  const ns = await Promise.all(Array.from({ length: 7 }, () => sa.recordFailure('race')))
  assert.deepEqual([...ns].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7])
  const m = await member('race')
  assert.equal(m.failedLogins, 7)
  assert.ok(m.lockedUntil && m.lockedUntil > Math.floor(Date.now() / 1000))
})

test('رسالة واحدة: بريد غير موجود، وكلمة خاطئة', async () => {
  assert.deepEqual(await sa.checkPassword('nobody@naf.sa', 'x'), { ok: false, error: sa.WRONG })
  assert.deepEqual(await sa.checkPassword('plain@naf.sa', 'wrong'), { ok: false, error: sa.WRONG })
  assert.match(sa.WRONG, /غير صحيحة/)
})

test('H5: الرمز يُخفى من عنوان الرسالة المسجّلة ونصها في الإنتاج', async () => {
  assert.equal(ch.maskSecret('رمز الدخول: 123456', '123456'), 'رمز الدخول: ••••••')
  assert.equal(ch.maskSecret('رمز الدخول: 123456', '123456', true), 'رمز الدخول: 123456')
  assert.equal(ch.maskSecret('بلا سرّ', undefined), 'بلا سرّ')
  const env = process.env as Record<string, string | undefined>
  const prev = env.NODE_ENV
  env.NODE_ENV = 'production'
  try {
    const r = await ch.send({ channel: 'email', to: 'x@naf.sa', kind: 'otp', subject: 'رمزك 654321', text: 'رمز الدخول: 654321', secret: '654321' })
    const [row] = await db.select().from(s.messageLog).where(eq(s.messageLog.id, r.id))
    assert.ok(!row.subject.includes('654321'), row.subject)
    assert.ok(!row.body.includes('654321'), row.body)
  } finally {
    env.NODE_ENV = prev
  }
})

test('M3: غير المالك لا يمنح ما لا يملكه، ولا يدير من يعلوه؛ والمالك بلا قيد', () => {
  const owner = { role: 'owner', perms: null }
  /* مدير محتوى مُنح إدارة الفريق */
  const lead = { role: 'content', perms: { '+': ['team.manage'], '-': [] } }
  const support = { role: 'support', perms: null }
  /* منح مباشر لصلاحية لا يملكها */
  assert.deepEqual(beyondActor(lead, support, { role: 'support', perms: JSON.stringify({ '+': ['trash.purge'], '-': [] }) }), ['trash.purge'])
  /* منح ما يملكه مسموح */
  assert.deepEqual(beyondActor(lead, { role: 'content', perms: null }, { role: 'content', perms: JSON.stringify({ '+': ['team.manage'], '-': [] }) }), [])
  /* فكّ حجب صلاحية لا يملكها = منح */
  const finance = { role: 'finance', perms: JSON.stringify({ '+': [], '-': ['sales.refund'] }) }
  const finLead = { role: 'content', perms: { '+': ['team.manage', 'sales.read', 'sales.orders', 'messages.read', 'corporate.manage', 'sales.coupons'], '-': [] } }
  assert.deepEqual(beyondActor(finLead, finance, { role: 'finance', perms: null }), ['sales.refund'])
  /* تغيير الدور إلى ما يتجاوزه */
  assert.ok(beyondActor(lead, support, { role: 'finance', perms: null }).includes('sales.refund'))
  /* رفع نفسه: الفاعل هو الهدف — المنح يتجاوزه حتماً */
  assert.deepEqual(beyondActor(lead, lead, { role: 'content', perms: JSON.stringify({ '+': ['team.manage', 'payments.manage'], '-': [] }) }), ['payments.manage'])
  /* من يعلوه لا يديره (رابط إعادة تعيين = استيلاء) */
  assert.ok(outranks({ role: 'finance', perms: null }, lead).length > 0)
  assert.deepEqual(outranks({ role: 'content', perms: null }, lead), [])
  /* المالك بلا قيد */
  assert.deepEqual(beyondActor(owner, support, { role: 'support', perms: JSON.stringify({ '+': ['trash.purge'], '-': [] }) }), [])
  assert.deepEqual(outranks({ role: 'owner', perms: null }, owner), [])
  assert.equal(effective(owner).length, effective({ role: 'owner', perms: '{"-":["team.manage"]}' }).length)
})
