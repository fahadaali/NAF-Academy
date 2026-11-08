'use server'
/* تهيئة المنصة من المتصفح — بكلمة مرور الإعداد (ADMIN_PASSWORD من إعدادات Cloudflare)، ومحاولات محدودة:
   حدّ لكل عنوان، وسقف عام للمحاولات الخاطئة من كل العناوين معاً (التخمين الموزّع)، والعدّادات في القاعدة. */
import { timingSafeEqual } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { envVar } from '@/server/runtime'
import { failures, limited } from '@/server/ratelimit'
import { runSetup, setOwnerPassword, type SetupResult } from '@/server/setup'

const input = z.object({
  password: z.string().min(1).max(200),
  ownerEmail: z.union([z.literal(''), z.string().trim().toLowerCase().email('بريد غير صالح').max(160)]),
  ownerPassword: z.string().max(200).default(''),
  seed: z.boolean(),
})

/** أقصر كلمة مرور إعداد مقبولة: هي وحدها تفتح التهيئة و«استعادة حساب المالك» (تعيين كلمة مروره ومسح تحققه الثنائي) */
const SETUP_PASSWORD_MIN = 16
/* سقف عام للمحاولات الخاطئة: 20 في الساعة من كل العناوين معاً — ثم تُغلق الصفحة حتى تنقضي الساعة */
const GLOBAL_MAX = 20
const GLOBAL_WINDOW = 60 * 60e3

/** null إن كانت كلمة مرور الإعداد مضبوطة بطول كافٍ، وإلا سبب واضح */
function setupPasswordProblem(): string | null {
  const want = envVar('ADMIN_PASSWORD') ?? ''
  if (!want) return 'أضف ADMIN_PASSWORD في إعدادات المتغيرات والأسرار أولاً'
  if (want.length < SETUP_PASSWORD_MIN)
    return `كلمة مرور الإعداد (ADMIN_PASSWORD) أقصر من ${SETUP_PASSWORD_MIN} حرفاً — وهي وحدها تفتح التهيئة واستعادة حساب المالك، فتخمينها استيلاء على المنصة كلها. عيّن قيمة أطول (يُفضّل 24 حرفاً عشوائياً فأكثر) في Cloudflare ← Variables and Secrets ثم أعد المحاولة`
  return null
}

function passwordOk(got: string) {
  const want = envVar('ADMIN_PASSWORD') ?? ''
  if (want.length < SETUP_PASSWORD_MIN) return false
  const a = Buffer.from(want), b = Buffer.from(got)
  return a.length === b.length && timingSafeEqual(a, b)
}

const LOCKED = 'محاولات خاطئة كثيرة على كلمة مرور الإعداد — أُغلقت هذه الصفحة مؤقتاً، حاول بعد ساعة'

/** يتحقق من كلمة مرور الإعداد ويحتسب الخطأ في السقف العام — null إن صحّت */
async function checkSetupPassword(got: string): Promise<string | null> {
  const problem = setupPasswordProblem()
  if (problem) return problem
  const gate = await failures('setup-password', GLOBAL_MAX, GLOBAL_WINDOW, 'global')
  if (gate.blocked()) return LOCKED
  if (passwordOk(got)) return null
  await gate.fail()
  return 'كلمة مرور الإعداد غير صحيحة'
}

export async function setupAction(raw: unknown): Promise<SetupResult> {
  if (await limited('setup', 8, 15 * 60e3)) return { ok: false, steps: [], error: 'محاولات كثيرة — انتظر ربع ساعة' }
  const p = input.safeParse(raw)
  if (!p.success) return { ok: false, steps: [], error: p.error.issues[0]?.message ?? 'بيانات غير صالحة' }
  const bad = await checkSetupPassword(p.data.password)
  if (bad) return { ok: false, steps: [], error: bad }
  try {
    const r = await runSetup({ ownerEmail: p.data.ownerEmail || undefined, ownerPassword: p.data.ownerPassword, seed: p.data.seed })
    revalidatePath('/', 'layout')
    return r
  } catch (e) {
    console.error('setup', e)
    return { ok: false, steps: [], error: `تعذّرت التهيئة — ${e instanceof Error ? e.message : 'خطأ غير معروف'}`.slice(0, 300) }
  }
}

const ownerInput = z.object({
  password: z.string().min(1).max(200),
  email: z.string().trim().toLowerCase().email('بريد غير صالح').max(160),
  newPassword: z.string().max(200),
  confirm: z.string().max(200),
  clearTwoStep: z.boolean(),
})

/** حساب المالك: تعيين كلمة المرور أو استعادته — بكلمة مرور الإعداد وحدها (مخرج الطوارئ إن نُسيت أو فُقد جهاز التحقق) */
export async function ownerAction(raw: unknown): Promise<SetupResult> {
  if (await limited('setup-owner', 6, 15 * 60e3)) return { ok: false, steps: [], error: 'محاولات كثيرة — انتظر ربع ساعة' }
  const p = ownerInput.safeParse(raw)
  if (!p.success) return { ok: false, steps: [], error: p.error.issues[0]?.message ?? 'بيانات غير صالحة' }
  const bad = await checkSetupPassword(p.data.password)
  if (bad) return { ok: false, steps: [], error: bad }
  if (p.data.newPassword !== p.data.confirm) return { ok: false, steps: [], error: 'كلمتا المرور غير متطابقتين' }
  try {
    return await setOwnerPassword(p.data.email, p.data.newPassword, p.data.clearTwoStep)
  } catch (e) {
    console.error('setup-owner', e)
    return { ok: false, steps: [], error: 'تعذّر الحفظ' }
  }
}
