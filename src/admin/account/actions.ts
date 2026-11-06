'use server'
/* حسابي: كلمة المرور والتحقق الثنائي لصاحب الجلسة وحده — كل عضو بأي دور (لا صلاحية خاصة: لا يمسّ إلا حسابه). */
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/server/auth'
import { audit } from '@/server/audit'
import { brandView } from '@/server/brand'
import { limited } from '@/server/ratelimit'
import { beginTotp, changeOwnPassword, confirmTotp, disableTotp } from '@/server/staff-auth'

type R = { ok: boolean; error?: string }

export async function changePassword(raw: { current: string; next: string; confirm: string }): Promise<R> {
  const me = await requireAdmin()
  const p = z.object({ current: z.string().min(1).max(200), next: z.string().max(200), confirm: z.string().max(200) }).safeParse(raw)
  if (!p.success) return { ok: false, error: 'بيانات غير صالحة' }
  if (p.data.next !== p.data.confirm) return { ok: false, error: 'كلمتا المرور غير متطابقتين' }
  if (await limited('staff-chpw', 10, 15 * 60e3)) return { ok: false, error: 'محاولات كثيرة — حاول بعد ربع ساعة' }
  const r = await changeOwnPassword(me.id, p.data.current, p.data.next)
  if (r.ok) await audit(me.name, 'password', 'member', me.email || me.id, 'غيّر كلمة مروره')
  return r
}

export async function startTotp(): Promise<{ ok: boolean; error?: string; secret?: string; qr?: string }> {
  const me = await requireAdmin()
  const r = await beginTotp(me.id, (await brandView()).name)
  if (!r) return { ok: false, error: 'التحقق الثنائي مفعّل من قبل' }
  const QRCode = (await import('qrcode')).default
  /* ألوان المكتبة تُستبدل بالرموز (الخلفية والحبر من .qr) */
  const qr = (await QRCode.toString(r.uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })).replace(/#ffffff/gi, 'transparent').replace(/#000000/g, 'currentColor')
  return { ok: true, secret: r.secret, qr }
}

export async function confirmTotpAction(code: string): Promise<R> {
  const me = await requireAdmin()
  if (typeof code !== 'string' || !/^\d{6}$/.test(code.replace(/\s/g, ''))) return { ok: false, error: 'الرمز 6 أرقام' }
  if (await limited('staff-totp', 20, 15 * 60e3)) return { ok: false, error: 'محاولات كثيرة' }
  const r = await confirmTotp(me.id, code.replace(/\s/g, ''))
  if (r.ok) { await audit(me.name, '2fa-on', 'member', me.email || me.id, 'فعّل التحقق الثنائي'); revalidatePath('/admin/account') }
  return r
}

export async function disableTotpAction(password: string): Promise<R> {
  const me = await requireAdmin()
  if (typeof password !== 'string' || !password) return { ok: false, error: 'أدخل كلمة المرور' }
  if (await limited('staff-totp-off', 10, 15 * 60e3)) return { ok: false, error: 'محاولات كثيرة' }
  const r = await disableTotp(me.id, password)
  if (r.ok) { await audit(me.name, '2fa-off', 'member', me.email || me.id, 'ألغى التحقق الثنائي'); revalidatePath('/admin/account') }
  return r
}
