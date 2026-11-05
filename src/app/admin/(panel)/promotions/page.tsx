import { asc, isNull } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { promotionsList } from '@/admin/sales/promotions'
import { PromotionsBoard } from '@/admin/sales/PromotionsBoard'

export default async function Promotions() {
  const [rows, courses, tracks] = await Promise.all([
    promotionsList(),
    db.select({ id: s.courses.id, title: s.courses.title }).from(s.courses).where(isNull(s.courses.deletedAt)).orderBy(asc(s.courses.sortOrder)),
    db.select({ id: s.tracks.id, title: s.tracks.title }).from(s.tracks).where(isNull(s.tracks.deletedAt)).orderBy(asc(s.tracks.sortOrder)),
  ])
  return <PromotionsBoard rows={rows} courses={courses} tracks={tracks} />
}
