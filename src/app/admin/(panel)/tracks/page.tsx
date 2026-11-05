import Link from 'next/link'
import { adminLists } from '@/admin/data'
import { PageHead } from '@/admin/ui/kit'
import { SortBoard } from '@/admin/ui/SortBoard'

export default async function Tracks() {
  const { tracks, courses, media } = await adminLists()
  const m = new Map(media.map((x) => [x.id, x]))
  return (
    <>
      <PageHead title="المسارات" sub="اسحب لترتيب المجلدات في رفّ المسارات" actions={<Link className="btn" href="/admin/tracks/new">+ مسار جديد</Link>} />
      <SortBoard entity="track" items={tracks.map((t) => {
        const cover = m.get(t.coverId ?? '')
        return {
          id: t.id, title: t.title, href: `/admin/tracks/${t.id}`, glyph: t.glyph, thumb: cover ? `/media/${cover.key}` : undefined,
          sub: `${courses.filter((c) => c.trackId === t.id).length} دورات · /${t.slug}`,
          badge: t.visible ? { tone: 'open', text: 'ظاهر' } : { tone: 'draft', text: 'مخفي' },
        }
      })} />
    </>
  )
}
