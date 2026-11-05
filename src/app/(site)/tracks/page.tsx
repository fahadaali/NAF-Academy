import type { Metadata } from 'next'
import { catalog, homeContent } from '@/server/queries'
import { TrackShelf } from '@/scenes/shelf/TrackShelf'
import { PageHero } from '@/site/PageHero'

export const revalidate = 300
export const metadata: Metadata = { title: 'المسارات' }

export default async function Tracks() {
  const [{ tracks }, home] = await Promise.all([catalog(), homeContent()])
  return (
    <>
      <PageHero eyebrow="المسارات" title="ستة طرق إلى الخبرة." body="كل مسار يبدأ من درجة الممارس ويصعد بك إلى الخبير." />
      <TrackShelf tracks={tracks} head={home.heads.tracks} />
    </>
  )
}
