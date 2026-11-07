/* تحويلات نموذج الدورة — تُستدعى من الخادم والمحرّر معاً */
import type { CourseRow } from '@/server/db/schema'
import type { CourseInput } from '@/admin/schemas'
import { DEFAULT_RULES, mergeRules } from '@/lib/certificate'

type Curriculum = CourseInput['curriculum']

export function blankCourse(): CourseInput {
  return {
    slug: '', title: '', subtitle: '', titleEn: '', trackId: null, level: 'practitioner', mode: 'live', status: 'draft',
    publishAt: null, startsAt: null, endsAt: null, hours: 0, seatsTotal: null, seatsTaken: 0, city: '', venue: '', venueMapUrl: '',
    coverId: null, price: 0, compareAt: null, saleStartsAt: null, saleEndsAt: null, free: false, accessDays: null, teaser: { provider: 'none' }, description: '', content: null, outcomes: [], audience: [],
    requirements: [], faq: [], featured: false, visibility: 'public', certificate: DEFAULT_RULES, seoTitle: '', seoDescription: '', instructorIds: [], curriculum: [], tiers: [], groupRules: [],
  }
}

export function fromRow(c: CourseRow, instructorIds: string[], curriculum: Curriculum, tiers: CourseInput['tiers'] = [], groupRules: CourseInput['groupRules'] = []): CourseInput {
  const { id: _id, previewToken: _p, sortOrder: _s, createdAt: _c, updatedAt: _u, deletedAt: _d, certificate, ...rest } = c
  return { ...rest, certificate: mergeRules(certificate), instructorIds, curriculum, tiers, groupRules }
}

