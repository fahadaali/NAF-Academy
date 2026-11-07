import { notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { courseLearners } from '@/admin/sales/data'
import { LearnersBoard } from '@/admin/sales/LearnersBoard'
import { InvitesBoard } from '@/admin/learners/InvitesBoard'
import { courseInvites } from '@/admin/learners/data'

export default async function Learners({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [{ enrolls, interest, cohorts }, invites] = await Promise.all([courseLearners(id), courseInvites(id)])
  const [c] = await db.select({ title: s.courses.title }).from(s.courses).where(eq(s.courses.id, id))
  if (!c) notFound()
  return (
    <>
      <LearnersBoard courseId={id} title={c.title} enrolls={enrolls} interest={interest} cohorts={cohorts} />
      <InvitesBoard invites={invites} cohorts={cohorts} />
    </>
  )
}
