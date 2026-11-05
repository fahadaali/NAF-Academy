import { notFound } from 'next/navigation'
import { adminLists, courseForEdit } from '@/admin/data'
import { CourseEditor } from '@/admin/courses/CourseEditor'
import { blankCourse, fromRow } from '@/admin/courses/form'

export default async function EditCourse({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { tracks, instructors, media } = await adminLists()
  if (id === 'new') return <CourseEditor id={null} initial={blankCourse()} tracks={tracks} instructors={instructors} media={media} />
  const data = await courseForEdit(id)
  if (!data) notFound()
  return (
    <CourseEditor
      key={data.course.updatedAt}
      id={id}
      initial={fromRow(data.course, data.instructorIds, data.curriculum, data.tiers, data.groupRules)}
      previewToken={data.course.previewToken}
      tracks={tracks}
      instructors={instructors}
      media={media}
    />
  )
}
