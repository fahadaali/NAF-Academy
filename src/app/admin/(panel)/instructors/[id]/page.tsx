import { notFound } from 'next/navigation'
import { adminLists } from '@/admin/data'
import { InstructorEditor } from '@/admin/people/InstructorEditor'

export default async function EditInstructor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { instructors, media } = await adminLists()
  if (id === 'new')
    return <InstructorEditor id={null} media={media} initial={{ slug: '', name: '', title: '', bio: '', highlights: [], links: [], photoId: null, display: 'full', featured: false }} />
  const p = instructors.find((x) => x.id === id)
  if (!p) notFound()
  const { slug, name, title, bio, highlights, links, photoId, display, featured } = p
  return <InstructorEditor key={p.updatedAt} id={id} media={media} initial={{ slug, name, title, bio, highlights, links, photoId, display, featured }} />
}
