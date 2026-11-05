import { asc } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { requirePermission } from '@/server/auth'
import { TeamBoard } from '@/admin/team/TeamBoard'

export default async function Team() {
  const me = await requirePermission('team.manage')
  const members = await db.select().from(s.members).orderBy(asc(s.members.createdAt))
  return <TeamBoard members={members} mode={me.mode} meId={me.id} />
}
