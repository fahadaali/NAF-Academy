import 'server-only'
/* العروض العامة — ما يسري منها الآن أو لاحقاً (لم ينتهِ)، ومنطبقها على دورة بعينها. */
import { and, eq, gt, isNull, or } from 'drizzle-orm'
import { db, schema as s } from './db'
import type { Promo } from '@/content/types'
import type { PromotionRow } from './db/schema'

export async function livePromotions(now = new Date()): Promise<PromotionRow[]> {
  return db.select().from(s.promotions)
    .where(and(eq(s.promotions.active, true), isNull(s.promotions.deletedAt), or(isNull(s.promotions.endsAt), gt(s.promotions.endsAt, now.toISOString()))))
}

/** العروض المنطبقة على الدورة: المنصة كلها، أو مسارها، أو هي بعينها */
export function promosFor(c: { id: string; trackId: string | null }, list: PromotionRow[]): Promo[] {
  return list
    .filter((p) => p.scope === 'all' || (p.scope === 'courses' && p.courseIds.includes(c.id)) || (p.scope === 'tracks' && !!c.trackId && p.trackIds.includes(c.trackId)))
    .map((p) => ({ label: p.label, kind: p.kind, value: p.value, startsAt: p.startsAt, endsAt: p.endsAt }))
}
