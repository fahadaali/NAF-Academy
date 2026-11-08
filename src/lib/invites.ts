/* الدعوات — قواعد نقية مشتركة بين الخادم واللوحة والاختبارات. */

/** صلاحية رابط الدعوة بالأيام (قرار المالك) — إعادة الإرسال تمدّها من جديد */
export const INVITE_DAYS = 14

export type InviteState = 'pending' | 'accepted' | 'revoked' | 'expired'

/** حال الدعوة الآن: المقبولة والملغاة نهائيتان، والمفتوحة تنتهي بموعدها (فتترك مقعدها) */
export function inviteState(r: { acceptedAt: string | null; revokedAt: string | null; expiresAt: string }, now = new Date()): InviteState {
  if (r.acceptedAt) return 'accepted'
  if (r.revokedAt) return 'revoked'
  return Date.parse(r.expiresAt) > now.getTime() ? 'pending' : 'expired'
}

export const inviteExpiry = (now = new Date()) => new Date(now.getTime() + INVITE_DAYS * 864e5).toISOString()
