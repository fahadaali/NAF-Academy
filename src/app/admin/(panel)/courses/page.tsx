import { adminLists } from '@/admin/data'
import { CoursesTable } from '@/admin/courses/CoursesTable'

export default async function CoursesPage() {
  const { courses, tracks, media } = await adminLists()
  return <CoursesTable courses={courses} tracks={tracks} media={media} />
}
