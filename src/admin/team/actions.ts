'use server'
/* الفريق: دعوة بالبريد، وتغيير الدور، والإيقاف — مع تبليغ المركز عند الدخول الموحّد. */
import { revalidatePath } from 'next/cache'
import { brandView } from '@/server/brand'
import { and, count, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema as s } from '@/server/db'
import { requirePermission, staffMode } from '@/server/auth'
import { audit } from '@/server/audit'
import { cfEnv } from '@/server/runtime'
import { ROLES, type Role } from '@/lib/permissions'
import { channelState, saveChannelSettings, type ChannelSettings } from '@/server/notify/channels'

async function report(email: string | null, state: 'granted' | 'revoked', reason: string, role?: string) {
  if (staffMode() !== 'naf-auth' || !email) return
  const env = cfEnv()
  if (!env) return
  const { reportAccessChange } = await import('naf-auth')
  const { ssoConfig } = await import('@/server/sso')
  await reportAccessChange(env, ssoConfig(env), { email, state, reason, ...(role ? { role } : {}) }).catch(() => {})
}

async function ownersLeft(exceptId: string) {
  const [r] = await db.select({ n: count() }).from(s.members).where(and(eq(s.members.role, 'owner'), eq(s.members.isActive, 1), ne(s.members.userId, exceptId)))
  return r.n
}

export async function inviteMember(raw: { email: string; name: string; role: string }): Promise<{ ok: boolean; error?: string }> {
  const me = await requirePermission('team.manage')
  const p = z.object({ email: z.string().trim().toLowerCase().email('بريد غير صالح'), name: z.string().trim().max(120), role: z.enum(ROLES) }).safeParse(raw)
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message }
  const [dup] = await db.select().from(s.members).where(eq(s.members.email, p.data.email))
  if (dup) return { ok: false, error: 'هذا البريد في الفريق من قبل' }
  await db.insert(s.members).values({ userId: `invite:${p.data.email}`, email: p.data.email, displayName: p.data.name || null, role: p.data.role, isActive: 1, createdAt: Math.floor(Date.now() / 1000) })
  await report(p.data.email, 'granted', `دعوة إلى لوحة ${(await brandView()).name}`, p.data.role)
  await audit(me.name, 'invite', 'member', p.data.email, p.data.role)
  revalidatePath('/admin/team')
  return { ok: true }
}

export async function setMemberRole(userId: string, role: Role): Promise<{ ok: boolean; error?: string }> {
  const me = await requirePermission('team.manage')
  if (!ROLES.includes(role)) return { ok: false, error: 'دور غير معروف' }
  const [m] = await db.select().from(s.members).where(eq(s.members.userId, userId))
  if (!m) return { ok: false, error: 'العضو غير موجود' }
  if (m.role === 'owner' && role !== 'owner' && (await ownersLeft(userId)) === 0) return { ok: false, error: 'لا بد من مالك نشط واحد على الأقل' }
  await db.update(s.members).set({ role }).where(eq(s.members.userId, userId))
  await report(m.email, 'granted', 'تغيير الدور', role)
  await audit(me.name, 'role', 'member', m.email ?? userId, `${m.role} ← ${role}`)
  revalidatePath('/admin/team')
  return { ok: true }
}

export async function setMemberActive(userId: string, active: boolean): Promise<{ ok: boolean; error?: string }> {
  const me = await requirePermission('team.manage')
  const [m] = await db.select().from(s.members).where(eq(s.members.userId, userId))
  if (!m) return { ok: false, error: 'العضو غير موجود' }
  if (!active && userId === me.id) return { ok: false, error: 'لا يمكنك إيقاف نفسك' }
  if (!active && m.role === 'owner' && (await ownersLeft(userId)) === 0) return { ok: false, error: 'لا بد من مالك نشط واحد على الأقل' }
  await db.update(s.members).set({ isActive: active ? 1 : 0 }).where(eq(s.members.userId, userId))
  await report(m.email, active ? 'granted' : 'revoked', active ? 'أُعيد تفعيله من إعدادات الأكاديمية' : 'أُوقف من إعدادات الأكاديمية')
  await audit(me.name, active ? 'enable' : 'disable', 'member', m.email ?? userId, active ? 'تفعيل' : 'إيقاف')
  revalidatePath('/admin/team')
  return { ok: true }
}

export async function saveChannels(v: ChannelSettings): Promise<{ ok: boolean; error?: string }> {
  const me = await requirePermission('channels.manage')
  if (v.emailEnabled && !channelState('email').configured) return { ok: false, error: channelState('email').problem }
  if (v.smsEnabled && !channelState('sms').configured) return { ok: false, error: channelState('sms').problem }
  if (v.pushEnabled && !channelState('push').configured) return { ok: false, error: channelState('push').problem }
  await saveChannelSettings({ emailEnabled: !!v.emailEnabled, smsEnabled: !!v.smsEnabled, pushEnabled: !!v.pushEnabled })
  await audit(me.name, 'update', 'channels', 'settings', `البريد ${v.emailEnabled ? 'مفعّل' : 'مقفل'} · الجوال ${v.smsEnabled ? 'مفعّل' : 'مقفل'} · المتصفح ${v.pushEnabled ? 'مفعّل' : 'مقفل'}`)
  revalidatePath('/', 'layout')
  return { ok: true }
}
