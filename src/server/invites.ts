import 'server-only'
/* دعوات التسجيل — الفريق يدعو مشاركاً ببريده إلى دورة (ودفعتها)، فيصله رابط موقّع يكمل منه بياناته فيُسجَّل ويدخل.
   الدعوة المفتوحة تحجز مقعداً (inviteHolds في cohorts.ts)، وتُقبل مرة واحدة بمطالبة ذرّية،
   و`nonce` يتغيّر عند إعادة الإرسال فيبطل كل رابط سابق. البريد من قالب «دعوة إلى برنامج» في اللوحة. */
import { randomBytes, randomUUID } from 'node:crypto'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { db, schema as s } from './db'
import { chunksOf, inList } from './db/limits'
import { audit } from './audit'
import { noRoom, overCapacity } from './sales'
import { enrollDirect } from './enroll'
import { learnerSecret } from './learner-auth'
import { siteUrl } from './site'
import { emailBrand } from './brand'
import { channelOpen, send } from './notify/channels'
import { renderEmail } from './notify/templates'
import { notifySettings } from './notify/engine'
import { readToken, signToken } from '@/lib/staff-crypto'
import { cohortState, hasAccess } from '@/lib/cohorts'
import { EVENT_META, fill } from '@/lib/notify'
import { formatDay } from '@/lib/dates'
import { inviteExpiry, inviteState } from '@/lib/invites'
import type { CohortRow, CourseRow, InvitationRow } from './db/schema'

type Tok = { k: 'learner-invite'; i: string; n: string; exp: number }
const nowIso = () => new Date().toISOString()
const nonce = () => randomBytes(12).toString('base64url')
const title = (t: string) => t.replace(/~\d?/g, '')

export async function inviteLink(r: Pick<InvitationRow, 'id' | 'nonce' | 'expiresAt'>): Promise<string> {
  const t = await signToken({ k: 'learner-invite', i: r.id, n: r.nonce, exp: Math.floor(Date.parse(r.expiresAt) / 1000) }, learnerSecret())
  return `${siteUrl() ?? ''}/invite?t=${encodeURIComponent(t)}`
}

async function courseAndCohort(courseId: string, cohortId: string | null | undefined): Promise<{ course: CourseRow; cohort: CohortRow | null } | { error: string }> {
  const [course] = await db.select().from(s.courses).where(and(eq(s.courses.id, courseId), isNull(s.courses.deletedAt)))
  if (!course || course.status === 'archived') return { error: 'الدورة غير متاحة' }
  const cohorts = await db.select().from(s.cohorts).where(and(eq(s.cohorts.courseId, course.id), isNull(s.cohorts.deletedAt)))
  const cohort = cohorts.find((k) => k.id === cohortId) ?? null
  if (cohorts.length && !cohort) return { error: 'اختر الدفعة' }
  if (cohort && cohortState({ ...cohort, taken: 0 }) === 'closed') return { error: `الدفعة «${cohort.title}» مغلقة أو انتهت` }
  return { course, cohort }
}

/** بريد الدعوة — إن كانت قناة البريد مفتوحة وقالبه مفعّلاً؛ وإلا يبقى الرابط في اللوحة للنسخ */
export async function sendInvite(r: InvitationRow, course: Pick<CourseRow, 'title'>, cohort: Pick<CohortRow, 'title'> | null): Promise<boolean> {
  if (!(await channelOpen('email'))) return false
  const tpl = (await notifySettings()).templates.invite
  if (!tpl.enabled) return false
  const site = siteUrl() ?? ''
  const link = await inviteLink(r)
  const vars: Record<string, string> = { name: r.name, course: title(course.title), link, cohort: cohort?.title ?? '', expires: formatDay(r.expiresAt) }
  const parts = renderEmail({
    site, brand: await emailBrand(site), heading: fill(tpl.heading, vars), body: fill(tpl.body, vars), preheader: fill(tpl.subject, vars),
    facts: EVENT_META.invite.facts.map(([k, x]) => [k, vars[x] ?? ''] as [string, string]),
    cta: { label: fill(tpl.cta || 'قبول الدعوة', vars), href: link },
  })
  const res = await send({ channel: 'email', to: r.email, kind: 'invite', subject: fill(tpl.subject, vars), text: `${parts.text}\n${link}`, html: parts.html, secret: link })
  if (res.ok) await db.update(s.invitations).set({ sentAt: nowIso(), updatedAt: nowIso() }).where(eq(s.invitations.id, r.id))
  return res.ok
}

export type InviteRow = { email: string; name: string; phone: string }
export type InviteOutcome = { email: string; status: 'invited' | 'enrolled-before' | 'invited-before'; link?: string; mailed?: boolean }

/** دعوات لعدة مشاركين في دورة (ودفعة): يتخطّى المسجّل الساري ومن له دعوة مفتوحة، ويحجز مقاعد البقية معاً أو يرفض كلها */
export async function createInvites(courseId: string, cohortId: string | null, rows: InviteRow[], by: string): Promise<{ ok: true; results: InviteOutcome[] } | { ok: false; error: string }> {
  const cc = await courseAndCohort(courseId, cohortId)
  if ('error' in cc) return { ok: false, error: cc.error }
  const { course, cohort } = cc
  const emails = [...new Set(rows.map((r) => r.email.trim().toLowerCase()))]
  if (!emails.length) return { ok: true, results: [] }
  const learners = await db.select({ id: s.learners.id, email: s.learners.email }).from(s.learners).where(inList(s.learners.email, emails))
  const enrolls = learners.length
    ? await db.select().from(s.enrollments).where(and(eq(s.enrollments.courseId, course.id), eq(s.enrollments.status, 'active'), inList(s.enrollments.learnerId, learners.map((l) => l.id))))
    : []
  const enrolled = new Set(enrolls.filter((e) => hasAccess(e)).map((e) => learners.find((l) => l.id === e.learnerId)!.email))
  const open = await db.select().from(s.invitations).where(and(eq(s.invitations.courseId, course.id), isNull(s.invitations.acceptedAt), isNull(s.invitations.revokedAt), inList(s.invitations.email, emails)))
  const now = new Date()
  const pending = new Set(open.filter((r) => inviteState(r, now) === 'pending').map((r) => r.email))
  /* دعوة مفتوحة انتهت مدتها تُستبدل بجديدة (الفهرس يسمح بواحدة مفتوحة) */
  const stale = open.filter((r) => inviteState(r, now) === 'expired')

  const results: InviteOutcome[] = []
  const fresh: (typeof s.invitations.$inferInsert)[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    const email = r.email.trim().toLowerCase()
    if (seen.has(email)) continue
    seen.add(email)
    if (enrolled.has(email)) { results.push({ email, status: 'enrolled-before' }); continue }
    if (pending.has(email)) { results.push({ email, status: 'invited-before' }); continue }
    fresh.push({ id: randomUUID(), courseId: course.id, cohortId: cohort?.id ?? null, email, name: r.name.trim(), phone: r.phone.trim(), nonce: nonce(), expiresAt: inviteExpiry(now), invitedBy: by })
  }
  if (!fresh.length) return { ok: true, results }
  const room = await noRoom(course, cohort, fresh.length)
  if (room) return { ok: false, error: cohort ? `${room} في «${cohort.title}» (المطلوب ${fresh.length})` : `${room} (المطلوب ${fresh.length})` }
  if (stale.length) await db.update(s.invitations).set({ revokedAt: nowIso(), updatedAt: nowIso() }).where(inList(s.invitations.id, stale.map((r) => r.id)))
  for (const part of chunksOf(s.invitations, fresh)) await db.insert(s.invitations).values(part).onConflictDoNothing()
  /* سباق على آخر المقاعد: يتراجع هذا الطلب كله */
  if (await overCapacity(course, cohort)) {
    await db.delete(s.invitations).where(inList(s.invitations.id, fresh.map((f) => f.id!)))
    return { ok: false, error: 'اكتملت المقاعد للتو — أعد المحاولة' }
  }
  const made = await db.select().from(s.invitations).where(inList(s.invitations.id, fresh.map((f) => f.id!)))
  for (const r of made) results.push({ email: r.email, status: 'invited', link: await inviteLink(r), mailed: await sendInvite(r, course, cohort) })
  await audit(by, 'invite', 'course', course.id, `${made.length} دعوة إلى ${title(course.title)}${cohort ? ` · ${cohort.title}` : ''}`)
  return { ok: true, results }
}

/** إعادة الإرسال: رابط جديد (يبطل السابق) ومدة جديدة — والمنتهية تحتاج مقعداً من جديد */
export async function resendInvite(id: string, by: string): Promise<{ ok: true; link: string; mailed: boolean } | { ok: false; error: string }> {
  const [r] = await db.select().from(s.invitations).where(eq(s.invitations.id, id))
  if (!r) return { ok: false, error: 'الدعوة غير موجودة' }
  const st = inviteState(r)
  if (st === 'accepted' || st === 'revoked') return { ok: false, error: st === 'accepted' ? 'قُبلت الدعوة من قبل' : 'الدعوة ملغاة' }
  const cc = await courseAndCohort(r.courseId, r.cohortId)
  if ('error' in cc) return { ok: false, error: cc.error }
  if (st === 'expired') {
    const room = await noRoom(cc.course, cc.cohort, 1)
    if (room) return { ok: false, error: room }
  }
  const [row] = await db.update(s.invitations).set({ nonce: nonce(), expiresAt: inviteExpiry(), updatedAt: nowIso() })
    .where(and(eq(s.invitations.id, id), isNull(s.invitations.acceptedAt), isNull(s.invitations.revokedAt))).returning()
  if (!row) return { ok: false, error: 'تغيّرت الدعوة للتو' }
  const mailed = await sendInvite(row, cc.course, cc.cohort)
  await audit(by, 'resend', 'invitation', id, row.email)
  return { ok: true, link: await inviteLink(row), mailed }
}

/** الإلغاء: يبطل الرابط ويحرّر المقعد */
export async function revokeInvite(id: string, by: string): Promise<{ ok: boolean; error?: string }> {
  const [row] = await db.update(s.invitations).set({ revokedAt: nowIso(), updatedAt: nowIso() })
    .where(and(eq(s.invitations.id, id), isNull(s.invitations.acceptedAt), isNull(s.invitations.revokedAt))).returning()
  if (!row) return { ok: false, error: 'الدعوة مقبولة أو ملغاة من قبل' }
  await audit(by, 'revoke', 'invitation', id, row.email)
  return { ok: true }
}

/** من تسجّل مباشرة وله دعوة مفتوحة في الدورة نفسها: تُغلق دعوته فيتحرر مقعدها */
export async function closeInvitesFor(courseId: string, email: string) {
  await db.update(s.invitations).set({ revokedAt: nowIso(), updatedAt: nowIso() })
    .where(and(eq(s.invitations.courseId, courseId), eq(s.invitations.email, email.trim().toLowerCase()), isNull(s.invitations.acceptedAt), isNull(s.invitations.revokedAt)))
}

/** صاحب الرابط: الدعوة مفتوحة وغير منتهية، والرابط آخر ما أُرسل */
export async function inviteTarget(token: string | null | undefined) {
  const t = await readToken<Tok>(token, learnerSecret(), 'learner-invite')
  if (!t) return null
  const [r] = await db.select().from(s.invitations).where(eq(s.invitations.id, t.i))
  if (!r || r.nonce !== t.n || inviteState(r) !== 'pending') return null
  const cc = await courseAndCohort(r.courseId, r.cohortId)
  if ('error' in cc) return null
  return { invite: r, ...cc }
}

export type InviteProfile = { name: string; phone: string; nameEn: string; org: string }

/** القبول: مطالبة ذرّية بالدعوة ← تسجيل بالمقعد المحجوز. الإجراء بعده يبدأ جلسة المتدرب (الرابط في بريده إثبات ملكيته كرمز الدخول) */
export async function acceptInvite(token: string, p: InviteProfile): Promise<{ ok: true; slug: string; learnerId: string } | { ok: false; error: string }> {
  const target = await inviteTarget(token)
  if (!target) return { ok: false, error: 'الرابط منتهٍ أو استُخدم — اطلب دعوة جديدة من إدارة البرنامج' }
  const { invite, course } = target
  const at = nowIso()
  const [claimed] = await db.update(s.invitations).set({ acceptedAt: at, updatedAt: at })
    .where(and(eq(s.invitations.id, invite.id), eq(s.invitations.nonce, invite.nonce), isNull(s.invitations.acceptedAt), isNull(s.invitations.revokedAt), gt(s.invitations.expiresAt, at)))
    .returning()
  if (!claimed) return { ok: false, error: 'الرابط استُخدم للتو' }
  const r = await enrollDirect({ courseId: course.id, cohortId: invite.cohortId, learner: { name: p.name, email: invite.email, phone: p.phone, org: p.org, nameEn: p.nameEn }, source: 'invite', by: `دعوة · ${invite.email}`, heldSeat: true })
  if (!r.ok) {
    await db.update(s.invitations).set({ acceptedAt: null, updatedAt: nowIso() }).where(eq(s.invitations.id, invite.id))
    return { ok: false, error: r.error }
  }
  await db.update(s.invitations).set({ enrollmentId: r.enrollmentId, updatedAt: nowIso() }).where(eq(s.invitations.id, invite.id))
  return { ok: true, slug: course.slug, learnerId: r.learnerId }
}

/** دعوات الدورة للوحة — الأحدث أولاً */
export async function invitesOf(courseId: string) {
  const rows = await db.select().from(s.invitations).where(eq(s.invitations.courseId, courseId)).orderBy(sql`${s.invitations.createdAt} desc`)
  const now = new Date()
  return rows.map((r) => ({ ...r, state: inviteState(r, now) }))
}
