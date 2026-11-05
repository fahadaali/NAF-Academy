import type { Metadata } from 'next'
import { catalog, homeContent, pagesContent } from '@/server/queries'
import { withCount } from '@/content/pages-defaults'
import { TrackShelf } from '@/scenes/shelf/TrackShelf'
import { PageHero } from '@/site/PageHero'

export const revalidate = 300
export async function generateMetadata(): Promise<Metadata> {
  const [{ tracks: t }, { tracks }] = await Promise.all([pagesContent(), catalog()])
  return { title: t.eyebrow || 'المسارات', description: withCount(t.seoDescription, tracks.length) || undefined }
}

export default async function Tracks() {
  const [{ tracks }, home, { tracks: head }] = await Promise.all([catalog(), homeContent(), pagesContent()])
  return (
    <>
      {/* «{{count}}» = عدد المسارات الظاهرة — لا رقم ثابت يخطئ إن تغيّرت */}
      <PageHero eyebrow={head.eyebrow} title={withCount(head.title, tracks.length)} body={withCount(head.body, tracks.length) || undefined} />
      <TrackShelf tracks={tracks} head={home.heads.tracks} />
    </>
  )
}
