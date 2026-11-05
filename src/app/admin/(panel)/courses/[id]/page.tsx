import { notFound } from 'next/navigation'
import { adminLists, courseForEdit } from '@/admin/data'
import { CourseEditor } from '@/admin/courses/CourseEditor'
import { blankCourse, fromRow } from '@/admin/courses/form'
import { isNull } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { cohortsForEdit } from '@/admin/cohorts/actions'

export default async function EditCourse({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params
  const { tab } = await searchParams
  const { tracks, instructors, media } = await adminLists()
  const templates = await db.select({ id: s.certificateTemplates.id, name: s.certificateTemplates.name }).from(s.certificateTemplates).where(isNull(s.certificateTemplates.deletedAt))
  if (id === 'new') return <CourseEditor id={null} initial={blankCourse()} tracks={tracks} instructors={instructors} media={media} templates={templates} />
  const data = await courseForEdit(id)
  if (!data) notFound()
  const cohorts = await cohortsForEdit(id)
  return (
    <CourseEditor
      key={data.course.updatedAt}
      id={id}
      initial={fromRow(data.course, data.instructorIds, data.curriculum, data.tiers, data.groupRules)}
      previewToken={data.course.previewToken}
      tracks={tracks}
      instructors={instructors}
      media={media}
      templates={templates}
      cohorts={cohorts}
      initialTab={tab}
    />
  )
}
