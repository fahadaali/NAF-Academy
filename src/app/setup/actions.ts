'use server'
/* تهيئة المنصة من المتصفح — بكلمة مرور الإعداد (ADMIN_PASSWORD من إعدادات Cloudflare)، ومحاولات محدودة. */
import { timingSafeEqual } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { envVar } from '@/server/runtime'
import { limited } from '@/server/ratelimit'
import { runSetup, type SetupResult } from '@/server/setup'

const input = z.object({
  password: z.string().min(1).max(200),
  ownerEmail: z.union([z.literal(''), z.string().trim().toLowerCase().email('بريد غير صالح').max(160)]),
  seed: z.boolean(),
})

function passwordOk(got: string) {
  const want = envVar('ADMIN_PASSWORD') ?? ''
  if (want.length < 8) return false
  const a = Buffer.from(want), b = Buffer.from(got)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function setupAction(raw: unknown): Promise<SetupResult> {
  if (await limited('setup', 8, 15 * 60e3)) return { ok: false, steps: [], error: 'محاولات كثيرة — انتظر ربع ساعة' }
  const p = input.safeParse(raw)
  if (!p.success) return { ok: false, steps: [], error: p.error.issues[0]?.message ?? 'بيانات غير صالحة' }
  if (!(envVar('ADMIN_PASSWORD') ?? '')) return { ok: false, steps: [], error: 'أضف ADMIN_PASSWORD في إعدادات المتغيرات والأسرار أولاً' }
  if (!passwordOk(p.data.password)) return { ok: false, steps: [], error: 'كلمة مرور الإعداد غير صحيحة' }
  try {
    const r = await runSetup({ ownerEmail: p.data.ownerEmail || undefined, seed: p.data.seed })
    revalidatePath('/', 'layout')
    return r
  } catch (e) {
    console.error('setup', e)
    return { ok: false, steps: [], error: `تعذّرت التهيئة — ${e instanceof Error ? e.message : 'خطأ غير معروف'}`.slice(0, 300) }
  }
}
