'use server'
/* الفريق: دعوة بالبريد (رابط تعيين كلمة المرور)، وتغيير الدور، والإيقاف، وروابط إعادة التعيين، وإلغاء التحقق الثنائي.
   الحسابات مستقلة في جدول members — لا هوية خارجية. ما يخصّ المالك (منح دور المالك، روابط حسابه، تحققه الثنائي) للمالك وحده. */
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { and, count, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema as s } from '@/server/db'
import { authReady, requirePermission, type Staff } from '@/server/auth'
import { audit } from '@/server/audit'
import { passwordLink, resetMemberTotp, revokeSessions, sendInviteEmail } from '@/server/staff-auth'
import { PERMS, ROLES, roleDefaults, type Role } from '@/lib/permissions'
import { channelState, saveChannelSettings, type ChannelSettings } from '@/server/notify/channels'

async function ownersLeft(exceptId: string) {
  const [r] = await db.select({ n: count() }).from(s.members).where(and(eq(s.members.role, 'owner'), eq(s.members.isActive, 1), ne(s.members.userId, exceptId)))
  return r.n
}

/** حساب المالك لا يمسّه إلا مالك (فلا يستولي عضو بصلاحية الفريق على حساب المالك) */
const guardOwner = (me: Staff, target: { role: string }) => target.role === 'owner' && me.role !== 'owner'

export type LinkResult = { ok: boolean; error?: string; link?: string; mailed?: boolean }

const NOT_READY = 'الروابط الموقّعة تحتاج السرّ ADMIN_SECRET في Cloudflare ← Variables and Secrets — أضفه ثم أعد المحاولة'

export async function inviteMember(raw: { email: string; name: string; role: string }): Promise<LinkResult> {
  const me = await requirePermission('team.manage')
  if (!authReady()) return { ok: false, error: NOT_READY }
  const p = z.object({ email: z.string().trim().toLowerCase().email('بريد غير صالح').max(160), name: z.string().trim().max(120), role: z.enum(ROLES) }).safeParse(raw)
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message }
  if (p.data.role === 'owner' && me.role !== 'owner') return { ok: false, error: 'دور المالك يمنحه مالك فقط' }
  const [dup] = await db.select().from(s.members).where(eq(s.members.email, p.data.email))
  if (dup) return { ok: false, error: 'هذا البريد في الفريق من قبل' }
  const [m] = await db.insert(s.members).values({ userId: randomUUID(), email: p.data.email, displayName: p.data.name || null, role: p.data.role, isActive: 1, createdAt: Math.floor(Date.now() / 1000) }).returning()
  const link = await passwordLink(m, 'invite')
  const mailed = await sendInviteEmail(m, link, me.name)
  await audit(me.name, 'invite', 'member', p.data.email, p.data.role)
  revalidatePath('/admin/team')
  return { ok: true, link, mailed }
}

/** رابط تعيين كلمة المرور لعضو: دعوة إن لم يعيّنها بعد، وإعادة تعيين إن عيّنها (يُخرجه من أجهزته متى استُعمل) */
export async function memberPasswordLink(userId: string): Promise<LinkResult> {
  const me = await requirePermission('team.manage')
  if (!authReady()) return { ok: false, error: NOT_READY }
  if (typeof userId !== 'string') return { ok: false, error: 'بيانات غير صالحة' }
  const [m] = await db.select().from(s.members).where(eq(s.members.userId, userId))
  if (!m) return { ok: false, error: 'العضو غير موجود' }
  if (!m.isActive) return { ok: false, error: 'فعّل العضو أولاً' }
  if (guardOwner(me, m)) return { ok: false, error: 'حساب المالك يديره مالك فقط' }
  const purpose = m.passwordHash ? 'reset' : 'invite'
  const link = await passwordLink(m, purpose)
  const mailed = purpose === 'invite' ? await sendInviteEmail(m, link, me.name) : false
  await audit(me.name, purpose === 'invite' ? 'invite-link' : 'reset-link', 'member', m.email ?? userId, purpose === 'invite' ? 'رابط دعوة' : 'رابط إعادة تعيين كلمة المرور')
  return { ok: true, link, mailed }
}

/** لعضو فقد جهاز المصادقة: يُلغى تحققه الثنائي وتسقط جلساته، فيدخل بكلمة المرور ثم يفعّله من جديد */
export async function resetMemberTwoStep(userId: string): Promise<{ ok: boolean; error?: string }> {
  const me = await requirePermission('team.manage')
  if (typeof userId !== 'string') return { ok: false, error: 'بيانات غير صالحة' }
  const [m] = await db.select().from(s.members).where(eq(s.members.userId, userId))
  if (!m) return { ok: false, error: 'العضو غير موجود' }
  if (guardOwner(me, m)) return { ok: false, error: 'حساب المالك يديره مالك فقط' }
  await resetMemberTotp(userId)
  await audit(me.name, '2fa-reset', 'member', m.email ?? userId, 'ألغى التحقق الثنائي للعضو')
  revalidatePath('/admin/team')
  return { ok: true }
}

export async function setMemberRole(userId: string, role: Role): Promise<{ ok: boolean; error?: string }> {
  const me = await requirePermission('team.manage')
  if (!ROLES.includes(role)) return { ok: false, error: 'دور غير معروف' }
  const [m] = await db.select().from(s.members).where(eq(s.members.userId, userId))
  if (!m) return { ok: false, error: 'العضو غير موجود' }
  if ((role === 'owner' || m.role === 'owner') && me.role !== 'owner') return { ok: false, error: 'دور المالك يمنحه ويسحبه مالك فقط' }
  if (m.role === 'owner' && role !== 'owner' && (await ownersLeft(userId)) === 0) return { ok: false, error: 'لا بد من مالك نشط واحد على الأقل' }
  await db.update(s.members).set({ role }).where(eq(s.members.userId, userId))
  await audit(me.name, 'role', 'member', m.email ?? userId, `${m.role} ← ${role}`)
  revalidatePath('/admin/team')
  return { ok: true }
}

export async function setMemberActive(userId: string, active: boolean): Promise<{ ok: boolean; error?: string }> {
  const me = await requirePermission('team.manage')
  if (typeof active !== 'boolean' || typeof userId !== 'string') return { ok: false, error: 'بيانات غير صالحة' }
  const [m] = await db.select().from(s.members).where(eq(s.members.userId, userId))
  if (!m) return { ok: false, error: 'العضو غير موجود' }
  if (!active && userId === me.id) return { ok: false, error: 'لا يمكنك إيقاف نفسك' }
  if (guardOwner(me, m)) return { ok: false, error: 'حساب المالك يديره مالك فقط' }
  if (!active && m.role === 'owner' && (await ownersLeft(userId)) === 0) return { ok: false, error: 'لا بد من مالك نشط واحد على الأقل' }
  await db.update(s.members).set({ isActive: active ? 1 : 0 }).where(eq(s.members.userId, userId))
  /* الإيقاف يُسقط كل جلساته وروابطه فوراً */
  if (!active) await revokeSessions(userId)
  await audit(me.name, active ? 'enable' : 'disable', 'member', m.email ?? userId, active ? 'تفعيل' : 'إيقاف')
  revalidatePath('/admin/team')
  return { ok: true }
}

/** تخصيص صلاحيات عضو فوق دوره: منح ما ليس في الدور، أو حجب ما فيه. */
export async function setMemberPerms(userId: string, raw: { add: string[]; remove: string[] }): Promise<{ ok: boolean; error?: string }> {
  const me = await requirePermission('team.manage')
  const p = z.object({ add: z.array(z.enum(PERMS)).max(PERMS.length), remove: z.array(z.enum(PERMS)).max(PERMS.length) }).safeParse(raw)
  if (!p.success || typeof userId !== 'string') return { ok: false, error: 'بيانات غير صالحة' }
  const [m] = await db.select().from(s.members).where(eq(s.members.userId, userId))
  if (!m) return { ok: false, error: 'العضو غير موجود' }
  /* المالك صلاحياته كاملة دائماً — لا تخصيص يحجب عنه شيئاً (ولا عن نفسه بالخطأ) */
  if (m.role === 'owner') return { ok: false, error: 'صلاحيات المالك كاملة ولا تُخصَّص — غيّر دوره أولاً إن لزم' }
  const base = roleDefaults(m.role)
  /* المنح لما ليس في الدور فقط، والحجب لما فيه فقط — فيبقى التخصيص صغيراً ومقروءاً */
  const add = [...new Set(p.data.add)].filter((x) => !base.includes(x))
  const remove = [...new Set(p.data.remove)].filter((x) => base.includes(x))
  if (remove.includes('team.manage') && userId === me.id) return { ok: false, error: 'لا تحجب عن نفسك إدارة الفريق' }
  if (remove.includes('team.manage') && m.role === 'owner' && (await ownersLeft(userId)) === 0) return { ok: false, error: 'لا بد من مالك يدير الفريق' }
  const perms = add.length || remove.length ? JSON.stringify({ '+': add, '-': remove }) : null
  await db.update(s.members).set({ perms }).where(eq(s.members.userId, userId))
  await audit(me.name, 'perms', 'member', m.email ?? userId, `منح: ${add.join('، ') || '—'} · حجب: ${remove.join('، ') || '—'}`)
  revalidatePath('/admin/team')
  return { ok: true }
}

/** ربط عضو بملف مدرب — دور «مدرب» يُحصر في دورات هذا الملف */
export async function setMemberInstructor(userId: string, instructorId: string | null): Promise<{ ok: boolean; error?: string }> {
  const me = await requirePermission('team.manage')
  if (typeof userId !== 'string' || (instructorId !== null && !z.string().uuid().safeParse(instructorId).success)) return { ok: false, error: 'بيانات غير صالحة' }
  const [m] = await db.select().from(s.members).where(eq(s.members.userId, userId))
  if (!m) return { ok: false, error: 'العضو غير موجود' }
  if (instructorId) {
    const [i] = await db.select({ id: s.instructors.id, name: s.instructors.name }).from(s.instructors).where(eq(s.instructors.id, instructorId))
    if (!i) return { ok: false, error: 'المدرب غير موجود' }
  }
  await db.update(s.members).set({ instructorId }).where(eq(s.members.userId, userId))
  await audit(me.name, 'link', 'member', m.email ?? userId, instructorId ? `ملف المدرب ${instructorId}` : 'فكّ الربط')
  revalidatePath('/admin/team')
  return { ok: true }
}

export async function saveChannels(raw: ChannelSettings): Promise<{ ok: boolean; error?: string }> {
  const me = await requirePermission('channels.manage')
  const parsed = z.object({ emailEnabled: z.boolean(), smsEnabled: z.boolean(), pushEnabled: z.boolean() }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'بيانات غير صالحة' }
  const v = parsed.data
  /* الدخول بالجوال وحده لا يكفي للشراء (لا يُنشئ حساباً جديداً) — البريد شرط لفتح الجوال */
  if (v.smsEnabled && !v.emailEnabled) return { ok: false, error: 'فعّل البريد أولاً: الرسائل النصية وحدها لا تكفي لتسجيل المتدربين الجدد' }
  if (v.emailEnabled && !channelState('email').configured) return { ok: false, error: channelState('email').problem }
  if (v.smsEnabled && !channelState('sms').configured) return { ok: false, error: channelState('sms').problem }
  if (v.pushEnabled && !channelState('push').configured) return { ok: false, error: channelState('push').problem }
  await saveChannelSettings({ emailEnabled: !!v.emailEnabled, smsEnabled: !!v.smsEnabled, pushEnabled: !!v.pushEnabled })
  await audit(me.name, 'update', 'channels', 'settings', `البريد ${v.emailEnabled ? 'مفعّل' : 'مقفل'} · الجوال ${v.smsEnabled ? 'مفعّل' : 'مقفل'} · المتصفح ${v.pushEnabled ? 'مفعّل' : 'مقفل'}`)
  revalidatePath('/', 'layout')
  return { ok: true }
}
