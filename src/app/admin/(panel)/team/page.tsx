import { asc, isNull } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { requirePermission } from '@/server/auth'
import { channelOpen } from '@/server/notify/channels'
import { TeamBoard, type TeamMember } from '@/admin/team/TeamBoard'

export default async function Team() {
  const me = await requirePermission('team.manage')
  const [rows, instructors, mail] = await Promise.all([
    db.select().from(s.members).orderBy(asc(s.members.createdAt)),
    db.select({ id: s.instructors.id, name: s.instructors.name }).from(s.instructors).where(isNull(s.instructors.deletedAt)).orderBy(asc(s.instructors.sortOrder)),
    channelOpen('email'),
  ])
  /* لا يصل إلى المتصفح تجزيء كلمة مرور ولا سرّ تحقق ثنائي — الحقول اللازمة للعرض وحدها */
  const members: TeamMember[] = rows.map((m) => ({
    userId: m.userId, email: m.email, displayName: m.displayName, role: m.role, perms: m.perms, isActive: !!m.isActive,
    instructorId: m.instructorId, hasPassword: !!m.passwordHash, totp: !!m.totpEnabledAt, lastSeenAt: m.lastSeenAt,
    locked: !!m.lockedUntil && m.lockedUntil > Date.now() / 1000,
  }))
  return <TeamBoard members={members} meId={me.id} meOwner={me.role === 'owner'} instructors={instructors} mail={mail} />
}
