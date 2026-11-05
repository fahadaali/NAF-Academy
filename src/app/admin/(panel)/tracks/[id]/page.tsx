import { notFound } from 'next/navigation'
import { adminLists } from '@/admin/data'
import { TrackEditor } from '@/admin/tracks/TrackEditor'

export default async function EditTrack({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { tracks, media } = await adminLists()
  if (id === 'new')
    return <TrackEditor id={null} media={media} initial={{ slug: '', title: '', kicker: '', summary: '', description: '', tone: 'gold', glyph: '', coverId: null, visible: true }} />
  const t = tracks.find((x) => x.id === id)
  if (!t) notFound()
  const { slug, title, kicker, summary, description, tone, glyph, coverId, visible } = t
  return <TrackEditor key={t.updatedAt} id={id} media={media} initial={{ slug, title, kicker, summary, description, tone, glyph, coverId, visible }} />
}
