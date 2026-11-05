import Link from 'next/link'
import { adminLists } from '@/admin/data'
import { PageHead } from '@/admin/ui/kit'
import { SortBoard } from '@/admin/ui/SortBoard'

const DISPLAY = { full: { tone: 'open', text: 'بطاقة كاملة' }, compact: { tone: 'soon', text: 'مختصرة' }, hidden: { tone: 'draft', text: 'مخفي' } }

export default async function Instructors() {
  const { instructors, links, media } = await adminLists()
  const m = new Map(media.map((x) => [x.id, x]))
  return (
    <>
      <PageHead title="المدربون" sub="الترتيب هنا هو ترتيب ظهورهم في الموقع" actions={<Link className="btn" href="/admin/instructors/new">+ مدرب جديد</Link>} />
      <SortBoard entity="instructor" items={instructors.map((p) => {
        const ph = m.get(p.photoId ?? '')
        return {
          id: p.id, title: p.name, href: `/admin/instructors/${p.id}`, glyph: p.name.slice(0, 1), thumb: ph ? `/media/${ph.key}` : undefined,
          sub: `${p.title} · ${links.filter((l) => l.instructorId === p.id).length} دورات${p.featured ? ' · ★ مميز' : ''}`,
          badge: DISPLAY[p.display],
        }
      })} />
    </>
  )
}
