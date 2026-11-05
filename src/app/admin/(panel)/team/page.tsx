import { asc, isNull } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { requirePermission } from '@/server/auth'
import { TeamBoard } from '@/admin/team/TeamBoard'

export default async function Team() {
  const me = await requirePermission('team.manage')
  const [members, instructors] = await Promise.all([
    db.select().from(s.members).orderBy(asc(s.members.createdAt)),
    db.select({ id: s.instructors.id, name: s.instructors.name }).from(s.instructors).where(isNull(s.instructors.deletedAt)).orderBy(asc(s.instructors.sortOrder)),
  ])
  return <TeamBoard members={members} mode={me.mode} meId={me.id} instructors={instructors} />
}
