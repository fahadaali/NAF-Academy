import { notFound } from 'next/navigation'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { courseScope, inScope, requirePermission } from '@/server/auth'
import { cohortSeatsUsed } from '@/server/cohorts'
import { seatsUsed } from '@/server/sales'
import { channelOpen } from '@/server/notify/channels'
import { cohortState } from '@/lib/cohorts'
import { AddParticipants } from '@/admin/learners/AddParticipants'

export default async function AddParticipantsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const st = await requirePermission('sales.orders')
  if (!inScope(await courseScope(st), id)) notFound()
  const [c] = await db.select().from(s.courses).where(and(eq(s.courses.id, id), isNull(s.courses.deletedAt)))
  if (!c) notFound()
  const all = await db.select().from(s.cohorts).where(and(eq(s.cohorts.courseId, id), isNull(s.cohorts.deletedAt))).orderBy(asc(s.cohorts.sortOrder))
  /* المغلقة يدوياً والمنتهية لا تُعرض — والمتبقي من سعة كل دفعة (والدعوات المفتوحة محسوبة فيه) */
  const cohorts = all.length
    ? await Promise.all(all.filter((k) => cohortState({ ...k, taken: 0 }) !== 'closed').map(async (k) => ({ id: k.id, title: k.title, room: k.seatsTotal === null ? null : Math.max(0, k.seatsTotal - (await cohortSeatsUsed(k))) })))
    : null
  const room = !all.length && c.seatsTotal !== null ? Math.max(0, c.seatsTotal - (await seatsUsed(c))) : null
  return <AddParticipants courseId={id} title={c.title} cohorts={cohorts} room={room} mailOpen={await channelOpen('email')} />
}
