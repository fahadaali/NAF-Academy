import 'server-only'
import { brandView, emailBrand } from '../brand'
/* محرّك الرسائل الآلية.
   ١) الجدولة بالمسح: كل دورة تشغيل (5 دقائق) تُقرأ الحالة الحالية — مواعيد الجلسات، والفتح المتدرّج، والطلبات،
      وقوائم الاهتمام — وتُدرج الرسائل المستحقة بمفتاح فريد. موعد الجلسة جزء من المفتاح، فتغييره يجدول تذكيرات
      جديدة ويُبطل القديمة تلقائياً، ولا تتكرر رسالة أبداً.
   ٢) الأحداث الفورية (التسجيل، منتصف الدورة، الإكمال) تُدرج في الطابور نفسه لحظة وقوعها.
   ٣) الإرسال: يُحجز كل صف ذرياً، ويُتحقق من أنه ما زال صحيحاً، ويُصاغ من القالب الحالي، ثم يُرسل ويُسجّل،
      ويُعاد المحاولة عند الفشل (5د ← 30د ← ساعتان). */
import { randomUUID } from 'node:crypto'
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, max, sql } from 'drizzle-orm'
import { db, schema as s } from '../db'
import { getSetting } from '../settings'
import { channelOpen, send, sendPushTo, type Channel } from './channels'
import { renderEmail } from './templates'
import { isOptedOut, optoutToken } from './optout'
import { siteUrl } from '../site'
import { BACKOFF_MIN, EVENT_META, fill, leftLabel, mergeNotify, reminderDue, type EventKey, type NotifySettings } from '@/lib/notify'
import { dripOpensAt } from '@/lib/learning'
import { formatDay, formatHijri, formatTime, formatWeekday } from '@/lib/dates'
import { formatAmount, priceView } from '@/lib/pricing'
import { resolveStatus } from '@/lib/course-meta'
import { chunksOf, inList } from '@/server/db/limits'

/** مفتوحة الآن؟ «المجدولة» تُفتح بنفسها عند موعد نشرها — كما تراها الواجهة */
const openNow = (c: { status: typeof s.courses.$inferSelect['status']; publishAt: string | null }, now: Date) => resolveStatus(c.status, c.publishAt, now) === 'open'

type Row = typeof s.notifications.$inferInsert
const iso = (d: Date) => d.toISOString()
const MIN = 60e3

export async function notifySettings(): Promise<NotifySettings> {
  return mergeNotify(await getSetting<Partial<NotifySettings> | null>('notify', null))
}

async function enqueue(rows: Omit<Row, 'id'>[]) {
  let n = 0
  for (const part of chunksOf(s.notifications, rows)) {
    const r = await db.insert(s.notifications).values(part.map((x) => ({ id: randomUUID(), ...x }))).onConflictDoNothing({ target: s.notifications.key }).returning({ id: s.notifications.id })
    n += r.length
  }
  return n
}

const when = (at: string) => `${formatWeekday(at)} ${formatDay(at)} · ${formatTime(at)} (${formatHijri(at)})`

/* ───────── الأحداث الفورية ───────── */

/** بعد إنشاء تسجيل — رسالة الترحيب بالبريد (والجوال إن وُجد) ثم إرسال فوري */
export async function onEnrolled(enrollmentId: string) {
  try {
    const [r] = await db.select({ e: s.enrollments, l: s.learners }).from(s.enrollments).innerJoin(s.learners, eq(s.learners.id, s.enrollments.learnerId)).where(eq(s.enrollments.id, enrollmentId))
    if (!r) return
    const now = iso(new Date())
    const base = { event: 'enrolled', learnerId: r.l.id, courseId: r.e.courseId, ref: { enrollmentId }, sendAt: now }
    const rows: Omit<Row, 'id'>[] = [{ ...base, key: `enrolled:${enrollmentId}:email`, channel: 'email', to: r.l.email }]
    if (r.l.phone) rows.push({ ...base, key: `enrolled:${enrollmentId}:sms`, channel: 'sms', to: r.l.phone })
    rows.push({ ...base, key: `enrolled:${enrollmentId}:push`, channel: 'push', to: r.l.id })
    await enqueue(rows)
    await dispatch(new Date(), { keys: rows.map((x) => x.key) })
  } catch (e) {
    console.error('onEnrolled', e)
  }
}

/** بعد اكتمال درس — تهنئة منتصف الدورة وإكمالها */
export async function onProgress(learnerId: string, courseId: string) {
  /* الشهادة أولاً: فحص الشروط مستقل عن رسائل التهنئة */
  try {
    const { checkCertificate } = await import('../certificates')
    await checkCertificate(learnerId, courseId)
  } catch (e) {
    console.error('certificate check', e)
  }
  try {
    const p = await progressOf([{ learnerId, courseId }])
    const pct = p.get(`${learnerId}:${courseId}`)?.pct ?? 0
    const [r] = await db.select({ e: s.enrollments, l: s.learners }).from(s.enrollments).innerJoin(s.learners, eq(s.learners.id, s.enrollments.learnerId))
      .where(and(eq(s.enrollments.learnerId, learnerId), eq(s.enrollments.courseId, courseId), eq(s.enrollments.status, 'active')))
    if (!r) return
    const event: EventKey | null = pct >= 100 ? 'completed' : pct >= 50 ? 'halfway' : null
    if (!event) return
    const key = `${event}:${r.e.id}`
    await enqueue([{ key, event, channel: 'email', to: r.l.email, learnerId, courseId, ref: { enrollmentId: r.e.id }, sendAt: iso(new Date()) }])
    await dispatch(new Date(), { keys: [key] })
  } catch (e) {
    console.error('onProgress', e)
  }
}

/** بعد اكتمال دفع طلب — تأكيد للمشتري بالفاتورة (ولو اشترى مقاعد لفريقه ولم يحضر). `resend`: إعادة إرسال من اللوحة */
export async function onOrderPaid(orderId: string, opts: { resend?: boolean } = {}) {
  try {
    const [o] = await db.select().from(s.orders).where(eq(s.orders.id, orderId))
    if (!o || o.total <= 0 || !['paid', 'partially_refunded', 'refunded'].includes(o.status)) return { ok: false }
    const [it] = await db.select({ courseId: s.orderItems.courseId }).from(s.orderItems).where(eq(s.orderItems.orderId, o.id))
    if (!it) return { ok: false }
    const key = `order:${o.id}:email${opts.resend ? `:r${Date.now()}` : ''}`
    await enqueue([{ key, event: 'order_paid', channel: 'email', to: o.buyer.email, learnerId: o.learnerId, courseId: it.courseId, ref: { orderId: o.id }, sendAt: iso(new Date()) }])
    const r = await dispatch(new Date(), { keys: [key] })
    return { ok: r.sent > 0 || r.retry > 0 }
  } catch (e) {
    console.error('onOrderPaid', e)
    return { ok: false }
  }
}

/** بعد تنفيذ استرداد — إشعار المشتري بالمبلغ والإشعار الدائن */
export async function onRefund(orderId: string, refundId: string) {
  try {
    const [o] = await db.select().from(s.orders).where(eq(s.orders.id, orderId))
    const [it] = o ? await db.select({ courseId: s.orderItems.courseId }).from(s.orderItems).where(eq(s.orderItems.orderId, o.id)) : []
    if (!o || !it) return
    const key = `refund:${refundId}:email`
    await enqueue([{ key, event: 'refund_issued', channel: 'email', to: o.buyer.email, learnerId: o.learnerId, courseId: it.courseId, ref: { orderId: o.id, refundId }, sendAt: iso(new Date()) }])
    await dispatch(new Date(), { keys: [key] })
  } catch (e) {
    console.error('onRefund', e)
  }
}

/** بعد إصدار شهادة — رسالة «صدرت شهادتك» بالبريد والجوال */
export async function onCertificate(certificateId: string) {
  const [c] = await db.select({ c: s.certificates, l: s.learners }).from(s.certificates).innerJoin(s.learners, eq(s.learners.id, s.certificates.learnerId)).where(eq(s.certificates.id, certificateId))
  if (!c) return
  const base = { event: 'certificate_issued', learnerId: c.l.id, courseId: c.c.courseId, ref: { certificateId }, sendAt: iso(new Date()) }
  const rows: Omit<Row, 'id'>[] = [{ ...base, key: `cert:${certificateId}:email`, channel: 'email', to: c.l.email }]
  if (c.l.phone) rows.push({ ...base, key: `cert:${certificateId}:sms`, channel: 'sms', to: c.l.phone })
  rows.push({ ...base, key: `cert:${certificateId}:push`, channel: 'push', to: c.l.id })
  await enqueue(rows)
  await dispatch(new Date(), { keys: rows.map((x) => x.key) })
}

/** نسبة الإنجاز لمجموعة (متدرب، دورة): الدروس المكتملة والجلسات المحضورة من كل الدروس */
export async function progressOf(pairs: { learnerId: string; courseId: string }[]) {
  const out = new Map<string, { pct: number; last: string | null }>()
  if (!pairs.length) return out
  const courseIds = [...new Set(pairs.map((p) => p.courseId))]
  const learnerIds = [...new Set(pairs.map((p) => p.learnerId))]
  const [totals, prog, att] = await Promise.all([
    db.select({ courseId: s.modules.courseId, n: count() }).from(s.lessons).innerJoin(s.modules, eq(s.modules.id, s.lessons.moduleId)).where(inList(s.modules.courseId, courseIds)).groupBy(s.modules.courseId),
    db.select({ learnerId: s.lessonProgress.learnerId, courseId: s.lessonProgress.courseId, done: sql<number>`sum(case when ${s.lessonProgress.completedAt} is not null then 1 else 0 end)`, last: max(s.lessonProgress.updatedAt) })
      .from(s.lessonProgress).where(and(inList(s.lessonProgress.courseId, courseIds), inList(s.lessonProgress.learnerId, learnerIds))).groupBy(s.lessonProgress.learnerId, s.lessonProgress.courseId),
    db.select({ learnerId: s.attendance.learnerId, courseId: s.attendance.courseId, n: count() }).from(s.attendance)
      .where(and(inList(s.attendance.courseId, courseIds), inList(s.attendance.learnerId, learnerIds))).groupBy(s.attendance.learnerId, s.attendance.courseId),
  ])
  const total = new Map(totals.map((t) => [t.courseId, t.n]))
  const pr = new Map(prog.map((p) => [`${p.learnerId}:${p.courseId}`, p]))
  const at = new Map(att.map((a) => [`${a.learnerId}:${a.courseId}`, a.n]))
  for (const { learnerId, courseId } of pairs) {
    const k = `${learnerId}:${courseId}`
    const n = total.get(courseId) ?? 0
    const done = Number(pr.get(k)?.done ?? 0) + (at.get(k) ?? 0)
    out.set(k, { pct: n ? Math.min(100, Math.round((done / n) * 100)) : 0, last: pr.get(k)?.last ?? null })
  }
  return out
}

/* ───────── الجدولة بالمسح ───────── */

async function activeEnrollments(courseIds: string[]) {
  if (!courseIds.length) return []
  return db.select({ e: s.enrollments, l: s.learners }).from(s.enrollments).innerJoin(s.learners, eq(s.learners.id, s.enrollments.learnerId))
    .where(and(inList(s.enrollments.courseId, courseIds), eq(s.enrollments.status, 'active')))
}

async function sessionLessons(from: Date, to: Date) {
  return db.select({ l: s.lessons, courseId: s.courses.id }).from(s.lessons)
    .innerJoin(s.modules, eq(s.modules.id, s.lessons.moduleId)).innerJoin(s.courses, eq(s.courses.id, s.modules.courseId))
    .where(and(inArray(s.lessons.type, ['live', 'onsite']), isNotNull(s.lessons.startsAt), gte(s.lessons.startsAt, iso(from)), lte(s.lessons.startsAt, iso(to)), isNull(s.courses.deletedAt)))
}

export async function planScan(now: Date, cfg: NotifySettings) {
  const rows: Omit<Row, 'id'>[] = []
  const t = now.getTime()
  const on = (e: EventKey) => cfg.templates[e].enabled

  /* ١) تذكيرات الجلسات */
  if (on('session_reminder') && cfg.sessionOffsets.length) {
    const maxOff = Math.max(...cfg.sessionOffsets.map((o) => o.minutes))
    const lessons = await sessionLessons(now, new Date(t + maxOff * MIN))
    const enr = await activeEnrollments([...new Set(lessons.map((x) => x.courseId))])
    const pushers = new Set((enr.length ? await db.selectDistinct({ id: s.pushSubscriptions.learnerId }).from(s.pushSubscriptions).where(inList(s.pushSubscriptions.learnerId, enr.map((x) => x.l.id))) : []).map((x) => x.id))
    for (const { l, courseId } of lessons) for (const { e, l: who } of enr.filter((x) => x.e.courseId === courseId)) for (const o of cfg.sessionOffsets) {
      const d = reminderDue(l.startsAt!, o.minutes, now, e.createdAt)
      if (!d.due) continue
      const base = { event: 'session_reminder', learnerId: who.id, courseId, ref: { lessonId: l.id, startsAt: l.startsAt, minutes: o.minutes }, sendAt: d.at }
      const k = `rem:${l.id}:${l.startsAt}:${o.minutes}:${who.id}`
      if (o.email) rows.push({ ...base, key: `${k}:email`, channel: 'email', to: who.email })
      if (o.sms && who.phone) rows.push({ ...base, key: `${k}:sms`, channel: 'sms', to: who.phone })
      if (o.sms && pushers.has(who.id)) rows.push({ ...base, key: `${k}:push`, channel: 'push', to: who.id })
    }
  }

  /* ٢) ما بعد الجلسة */
  if (on('session_followup')) {
    /* الجلسة قد تنتهي بعد بدئها بساعات، والمهلة من اللوحة حتى أسبوع: النافذة تتسع لهما مع يوم السماح */
    const lessons = await sessionLessons(new Date(t - cfg.followupDelay * MIN - 2 * 864e5), now)
    const enr = await activeEnrollments([...new Set(lessons.map((x) => x.courseId))])
    for (const { l, courseId } of lessons) {
      const end = l.endsAt ? Date.parse(l.endsAt) : Date.parse(l.startsAt!) + 2 * 3600e3
      const due = end + cfg.followupDelay * MIN
      if (due > t || t - due > 864e5) continue
      for (const { e, l: who } of enr.filter((x) => x.e.courseId === courseId)) {
        if (Date.parse(e.createdAt) >= end) continue
        rows.push({ key: `fu:${l.id}:${l.startsAt}:${who.id}`, event: 'session_followup', channel: 'email', to: who.email, learnerId: who.id, courseId, ref: { lessonId: l.id }, sendAt: iso(new Date(due)) })
      }
    }
  }

  /* ٣) الفتح المتدرّج */
  if (on('drip_unlocked')) {
    const lessons = await db.select({ l: s.lessons, courseId: s.courses.id }).from(s.lessons)
      .innerJoin(s.modules, eq(s.modules.id, s.lessons.moduleId)).innerJoin(s.courses, eq(s.courses.id, s.modules.courseId))
      .where(and(sql`json_extract(${s.lessons.drip}, '$.mode') <> 'none'`, isNull(s.courses.deletedAt)))
    const enr = await activeEnrollments([...new Set(lessons.map((x) => x.courseId))])
    for (const { l, courseId } of lessons) for (const { e, l: who } of enr.filter((x) => x.e.courseId === courseId)) {
      const opens = dripOpensAt(l.drip, e.createdAt)
      if (!opens) continue
      const at = Date.parse(opens)
      if (at <= Date.parse(e.createdAt) + MIN || at > t || t - at > 864e5) continue
      rows.push({ key: `drip:${l.id}:${opens}:${who.id}`, event: 'drip_unlocked', channel: 'email', to: who.email, learnerId: who.id, courseId, ref: { lessonId: l.id }, sendAt: opens })
    }
  }

  /* ٤) التحفيز بعد التوقف */
  if (on('inactive_nudge') && cfg.inactiveDays > 0) {
    const cutoff = iso(new Date(t - cfg.inactiveDays * 864e5))
    const enr = await db.select({ e: s.enrollments, l: s.learners }).from(s.enrollments).innerJoin(s.learners, eq(s.learners.id, s.enrollments.learnerId))
      .innerJoin(s.courses, eq(s.courses.id, s.enrollments.courseId))
      .where(and(eq(s.enrollments.status, 'active'), lt(s.enrollments.createdAt, cutoff), inArray(s.courses.mode, ['recorded', 'blended']), isNull(s.courses.deletedAt)))
    const prog = await progressOf(enr.map(({ e }) => ({ learnerId: e.learnerId, courseId: e.courseId })))
    for (const { e, l: who } of enr) {
      const p = prog.get(`${e.learnerId}:${e.courseId}`)!
      const last = p.last && p.last > e.createdAt ? p.last : e.createdAt
      if (p.pct >= 100 || last > cutoff) continue
      rows.push({ key: `idle:${e.id}:${last}`, event: 'inactive_nudge', channel: 'email', to: who.email, learnerId: who.id, courseId: e.courseId, ref: { enrollmentId: e.id, last }, sendAt: iso(now) })
    }
  }

  /* ٥) فتح التسجيل لقوائم الاهتمام */
  if (on('registration_open')) {
    const list = await db.select({ i: s.interest, c: s.courses }).from(s.interest).innerJoin(s.courses, eq(s.courses.id, s.interest.courseId))
      .where(and(isNull(s.interest.notifiedAt), inArray(s.courses.status, ['open', 'scheduled']), isNull(s.courses.deletedAt)))
    const { seatsUsed, salesOpen } = await import('../sales')
    /* الدفع مقفل: «فُتح التسجيل» لدورة مدفوعة وعدٌ لا يتحقق — ننتظر فتحه */
    const sellable = await salesOpen()
    const tiered = new Set((await db.select({ id: s.priceTiers.courseId }).from(s.priceTiers).groupBy(s.priceTiers.courseId)).map((x) => x.id))
    const room = new Map<string, boolean>()
    for (const { i, c } of list) {
      if (!openNow(c, now)) continue
      if (!sellable && !c.free && (c.price > 0 || tiered.has(c.id))) continue
      if (!room.has(c.id)) room.set(c.id, !c.seatsTotal || (await seatsUsed(c)) < c.seatsTotal)
      if (!room.get(c.id)) continue
      const base = { event: 'registration_open', courseId: c.id, ref: { interestId: i.id, email: i.email }, sendAt: iso(now), learnerId: null }
      rows.push({ ...base, key: `open:${i.id}:email`, channel: 'email', to: i.email })
      if (i.phone) rows.push({ ...base, key: `open:${i.id}:sms`, channel: 'sms', to: i.phone })
    }
  }

  /* ٦) قرب انتهاء العرض */
  if (on('sale_ending') && cfg.saleHours > 0) {
    const courses = await db.select().from(s.courses)
      .where(and(inArray(s.courses.status, ['open', 'scheduled']), isNull(s.courses.deletedAt), isNotNull(s.courses.saleEndsAt), gte(s.courses.saleEndsAt, iso(now)), lte(s.courses.saleEndsAt, iso(new Date(t + cfg.saleHours * 3600e3)))))
    /* العرض على السعر الأساسي أو على باقة — كلاهما ينتهي بموعد الدورة نفسه */
    const tierSale = new Set((await db.select({ id: s.priceTiers.courseId }).from(s.priceTiers).where(sql`${s.priceTiers.compareAt} > ${s.priceTiers.price}`)).map((x) => x.id))
    for (const c of courses) {
      if (!openNow(c, now) || !((c.compareAt ?? 0) > c.price || tierSale.has(c.id))) continue
      const people = await db.select({ email: s.interest.email }).from(s.interest).where(eq(s.interest.courseId, c.id)).groupBy(s.interest.email)
      const enrolled = new Set((await db.select({ email: s.learners.email }).from(s.enrollments).innerJoin(s.learners, eq(s.learners.id, s.enrollments.learnerId))
        .where(and(eq(s.enrollments.courseId, c.id), eq(s.enrollments.status, 'active')))).map((x) => x.email))
      for (const { email } of people) if (!enrolled.has(email))
        rows.push({ key: `sale:${c.id}:${c.saleEndsAt}:${email}`, event: 'sale_ending', channel: 'email', to: email, learnerId: null, courseId: c.id, ref: { ends: c.saleEndsAt }, sendAt: iso(now) })
    }
  }

  /* ٧) السلة المتروكة — آخر طلب غير مدفوع لكل (متدرب، دورة) */
  if (on('cart_abandoned') && cfg.cartDelays.length) {
    const maxD = Math.max(...cfg.cartDelays)
    const orders = await db.select({ o: s.orders, courseId: s.orderItems.courseId }).from(s.orders).innerJoin(s.orderItems, eq(s.orderItems.orderId, s.orders.id))
      .where(and(gte(s.orders.createdAt, iso(new Date(t - (maxD * MIN + 864e5)))), sql`${s.orders.total} > 0`)).orderBy(desc(s.orders.createdAt))
    const seen = new Set<string>()
    for (const { o, courseId } of orders) {
      const pair = `${o.learnerId}:${courseId}`
      if (seen.has(pair)) continue
      seen.add(pair)
      if (o.status !== 'pending' && o.status !== 'failed') continue
      for (const [i, d] of cfg.cartDelays.entries()) {
        const due = Date.parse(o.createdAt) + d * MIN
        if (due > t || t - due > 864e5) continue
        rows.push({ key: `cart:${o.id}:${d}`, event: 'cart_abandoned', channel: 'email', to: o.buyer.email, learnerId: o.learnerId, courseId, ref: { orderId: o.id, last: i === cfg.cartDelays.length - 1 ? 1 : 0 }, sendAt: iso(new Date(due)) })
      }
    }
  }

  return enqueue(rows)
}

/* ───────── الإرسال ───────── */

type Ctx = { ok: true; vars: Record<string, string>; name: string; after?: () => Promise<void> } | { ok: false; reason: string }

async function enrollmentActive(learnerId: string | null, courseId: string | null) {
  if (!learnerId || !courseId) return false
  const [e] = await db.select({ id: s.enrollments.id }).from(s.enrollments).where(and(eq(s.enrollments.learnerId, learnerId), eq(s.enrollments.courseId, courseId), eq(s.enrollments.status, 'active')))
  return !!e
}

async function contextFor(n: typeof s.notifications.$inferSelect, site: string, cfg: NotifySettings, now: Date): Promise<Ctx> {
  const [course] = n.courseId ? await db.select().from(s.courses).where(eq(s.courses.id, n.courseId)) : []
  if (!course || course.deletedAt) return { ok: false, reason: 'الدورة غير موجودة' }
  const [learner] = n.learnerId ? await db.select().from(s.learners).where(eq(s.learners.id, n.learnerId)) : []
  const ev = n.event as EventKey
  const pv = priceView({ amount: course.price, compareAt: course.compareAt ?? undefined, saleEndsAt: course.saleEndsAt ?? undefined, free: course.free }, now)
  const vars: Record<string, string> = {
    name: learner?.name?.split(/\s+/)[0] ?? '',
    course: course.title.replace(/~\d/g, ''),
    link: `${site}/learn/${course.slug}`,
    calendar: `${site}/courses/${course.slug}/calendar`,
    starts: course.startsAt ? when(course.startsAt) : '',
    price: pv.free ? 'مجانية' : `${formatAmount(pv.current)} ر.س`,
  }
  const lessonOf = async () => {
    const id = String(n.ref.lessonId ?? '')
    const [l] = id ? await db.select().from(s.lessons).where(eq(s.lessons.id, id)) : []
    return l ?? null
  }
  const needEnrolled = ['enrolled', 'session_reminder', 'session_followup', 'drip_unlocked', 'inactive_nudge', 'halfway', 'completed'].includes(ev)
  if (needEnrolled && !(await enrollmentActive(n.learnerId, n.courseId))) return { ok: false, reason: 'التسجيل لم يعد فعّالاً' }

  switch (ev) {
    case 'enrolled': {
      const [o] = await db.select({ number: s.orders.number }).from(s.orders).innerJoin(s.enrollments, eq(s.enrollments.orderId, s.orders.id)).where(eq(s.enrollments.id, String(n.ref.enrollmentId)))
      vars.order = o?.number ?? ''
      break
    }
    case 'session_reminder': {
      const l = await lessonOf()
      if (!l || l.startsAt !== n.ref.startsAt) return { ok: false, reason: 'تغيّر موعد الجلسة' }
      if (now.getTime() >= Date.parse(l.startsAt!)) return { ok: false, reason: 'بدأت الجلسة' }
      Object.assign(vars, {
        lesson: l.title, when: when(l.startsAt!), left: leftLabel(Number(n.ref.minutes)), link: `${site}/learn/${course.slug}/${l.id}`,
        location: l.type === 'onsite' ? (l.location || [course.venue, course.city].filter(Boolean).join('، ')) : 'عن بُعد — زر الانضمام في صفحة الجلسة',
      })
      break
    }
    case 'session_followup':
    case 'drip_unlocked': {
      const l = await lessonOf()
      if (!l) return { ok: false, reason: 'الدرس غير موجود' }
      Object.assign(vars, { lesson: l.title, link: `${site}/learn/${course.slug}/${l.id}` })
      break
    }
    case 'inactive_nudge':
    case 'halfway': {
      const p = (await progressOf([{ learnerId: n.learnerId!, courseId: course.id }])).get(`${n.learnerId}:${course.id}`)!
      if (ev === 'inactive_nudge' && (p.pct >= 100 || (p.last && p.last > String(n.ref.last)))) return { ok: false, reason: 'عاد المتدرب للدورة' }
      vars.pct = `${p.pct}%`
      break
    }
    case 'registration_open': {
      const [i] = await db.select().from(s.interest).where(eq(s.interest.id, String(n.ref.interestId)))
      if (!i) return { ok: false, reason: 'أُزيل الاهتمام' }
      if (!openNow(course, now)) return { ok: false, reason: 'أُغلق التسجيل' }
      vars.name = i.name.split(/\s+/)[0] ?? ''
      vars.link = `${site}/courses/${course.slug}`
      return { ok: true, vars, name: vars.name, after: async () => { await db.update(s.interest).set({ notifiedAt: new Date().toISOString() }).where(eq(s.interest.id, i.id)) } }
    }
    case 'sale_ending': {
      if (course.saleEndsAt !== n.ref.ends || Date.parse(course.saleEndsAt!) <= now.getTime()) return { ok: false, reason: 'تغيّر العرض' }
      const [en] = await db.select({ id: s.enrollments.id }).from(s.enrollments).innerJoin(s.learners, eq(s.learners.id, s.enrollments.learnerId))
        .where(and(eq(s.enrollments.courseId, course.id), eq(s.learners.email, n.to), eq(s.enrollments.status, 'active')))
      if (en) return { ok: false, reason: 'سجّل في الدورة' }
      const [i] = await db.select({ name: s.interest.name }).from(s.interest).where(and(eq(s.interest.courseId, course.id), eq(s.interest.email, n.to)))
      Object.assign(vars, { name: i?.name.split(/\s+/)[0] ?? '', ends: when(course.saleEndsAt!), link: `${site}/courses/${course.slug}` })
      break
    }
    case 'cart_abandoned': {
      const [o] = await db.select().from(s.orders).where(eq(s.orders.id, String(n.ref.orderId)))
      if (!o || (o.status !== 'pending' && o.status !== 'failed')) return { ok: false, reason: 'اكتمل الطلب أو أُلغي' }
      if (await enrollmentActive(n.learnerId, course.id)) return { ok: false, reason: 'سجّل في الدورة' }
      const coupon = n.ref.last && cfg.cartCoupon ? cfg.cartCoupon : ''
      Object.assign(vars, { name: o.buyer.name.split(/\s+/)[0] ?? '', coupon, link: `${site}/courses/${course.slug}/enroll${coupon ? `?coupon=${encodeURIComponent(coupon)}` : ''}` })
      break
    }
    case 'order_paid':
    case 'refund_issued': {
      const [o] = await db.select().from(s.orders).where(eq(s.orders.id, String(n.ref.orderId)))
      if (!o) return { ok: false, reason: 'الطلب غير موجود' }
      const items = await db.select({ q: s.orderItems.quantity }).from(s.orderItems).where(eq(s.orderItems.orderId, o.id))
      const seats = items.reduce((a, x) => a + x.q, 0)
      Object.assign(vars, {
        name: o.buyer.name.split(/\s+/)[0] ?? '', order: o.number, total: `${formatAmount(o.total)} ر.س`,
        seats: seats > 1 ? `${seats} مقاعد` : '', link: `${site}/orders/${o.number}?t=${o.token}`,
      })
      if (ev === 'refund_issued') {
        const [rf] = await db.select().from(s.refunds).where(eq(s.refunds.id, String(n.ref.refundId)))
        if (!rf) return { ok: false, reason: 'الاسترداد غير موجود' }
        vars.amount = `${formatAmount(rf.amount)} ر.س`
      }
      return { ok: true, vars, name: vars.name }
    }
    case 'certificate_issued': {
      const [c] = await db.select().from(s.certificates).where(eq(s.certificates.id, String(n.ref.certificateId)))
      if (!c || c.status !== 'issued' || !c.code) return { ok: false, reason: 'الشهادة غير صادرة' }
      Object.assign(vars, { code: c.code, link: `${site}/certificates/${c.code}` })
      break
    }
    default:
      break
  }
  return { ok: true, vars, name: vars.name }
}

export type DispatchResult = { sent: number; skipped: number; failed: number; retry: number; problem?: string }

/** يرسل المستحق من الطابور. keys: لإرسال صفوف بعينها فوراً (الأحداث الفورية) */
export async function dispatch(now: Date, opt: { limit?: number; keys?: string[]; ids?: string[] } = {}): Promise<DispatchResult> {
  const out: DispatchResult = { sent: 0, skipped: 0, failed: 0, retry: 0 }
  const site = siteUrl()
  if (!site) return { ...out, problem: 'SITE_URL غير مضبوط — الرسائل الآلية متوقفة' }
  const cfg = await notifySettings()
  const mailBrand = await emailBrand(site)
  const pushIcon = (await brandView()).icon?.url
  /* صفوف علقت في الإرسال (انقطاع) تعود للطابور */
  await db.update(s.notifications).set({ status: 'pending' }).where(and(eq(s.notifications.status, 'sending'), lt(s.notifications.updatedAt, iso(new Date(now.getTime() - 10 * MIN)))))
  const due = await db.select().from(s.notifications).where(and(
    eq(s.notifications.status, 'pending'), lte(s.notifications.sendAt, iso(now)),
    opt.keys ? inList(s.notifications.key, opt.keys) : undefined, opt.ids ? inList(s.notifications.id, opt.ids) : undefined,
  )).orderBy(asc(s.notifications.sendAt)).limit(opt.limit ?? 100)

  for (const n of due) {
    const [claimed] = await db.update(s.notifications).set({ status: 'sending', updatedAt: iso(new Date()) })
      .where(and(eq(s.notifications.id, n.id), eq(s.notifications.status, 'pending'))).returning({ id: s.notifications.id })
    if (!claimed) continue
    const finish = (status: 'sent' | 'skipped' | 'cancelled' | 'failed' | 'pending', extra: Partial<Row> = {}) =>
      db.update(s.notifications).set({ status, updatedAt: iso(new Date()), ...extra }).where(eq(s.notifications.id, n.id))
    const ev = n.event as EventKey
    const tpl = cfg.templates[ev]
    const meta = EVENT_META[ev]
    if (!tpl || !meta) { await finish('cancelled', { error: 'حدث غير معروف' }); out.skipped++; continue }
    if (!tpl.enabled) { await finish('skipped', { error: 'الرسالة موقوفة من اللوحة' }); out.skipped++; continue }
    if (n.channel === 'sms' && (!meta.sms || !tpl.sms.trim())) { await finish('skipped', { error: 'لا نص جوال لهذه الرسالة' }); out.skipped++; continue }
    if (n.channel === 'push') {
      if (!meta.sms) { await finish('skipped', { error: 'لا إشعار لهذه الرسالة' }); out.skipped++; continue }
      const [sub] = n.learnerId ? await db.select({ id: s.pushSubscriptions.id }).from(s.pushSubscriptions).where(eq(s.pushSubscriptions.learnerId, n.learnerId)).limit(1) : []
      if (!sub) { await finish('skipped', { error: 'لم يفعّل التنبيهات' }); out.skipped++; continue }
    }
    if (!(await channelOpen(n.channel as Channel))) { await finish('skipped', { error: 'القناة مقفلة' }); out.skipped++; continue }
    let email = n.channel === 'email' ? n.to : typeof n.ref?.email === 'string' ? n.ref.email : ''
    if (!email && n.learnerId) email = (await db.select({ e: s.learners.email }).from(s.learners).where(eq(s.learners.id, n.learnerId)))[0]?.e ?? ''
    if (meta.category !== 'transactional' && email && (await isOptedOut(email))) { await finish('skipped', { error: 'ألغى الاشتراك' }); out.skipped++; continue }

    let ctx: Ctx
    try { ctx = await contextFor(n, site, cfg, now) } catch (e) {
      /* خطأ عابر (قاعدة، شبكة) لا يلغي الرسالة: يُعاد بالتراجع الزمني نفسه، ثم يفشل بعد آخر محاولة */
      const error = String((e as Error).message).slice(0, 200)
      if (n.attempts < BACKOFF_MIN.length) { await finish('pending', { attempts: n.attempts + 1, error, sendAt: iso(new Date(now.getTime() + BACKOFF_MIN[n.attempts] * MIN)) }); out.retry++ }
      else { await finish('failed', { attempts: n.attempts + 1, error }); out.failed++ }
      continue
    }
    if (!ctx.ok) { await finish('cancelled', { error: ctx.reason }); out.skipped++; continue }

    const v = ctx.vars
    const unsub = meta.category !== 'transactional' && email ? `${site}/unsubscribe?t=${optoutToken(email)}` : undefined
    let r: Awaited<ReturnType<typeof send>>
    if (n.channel === 'email') {
      const { html, text } = renderEmail({
        site, brand: mailBrand, heading: fill(tpl.heading, v), body: fill(tpl.body, v), preheader: fill(tpl.subject, v),
        facts: meta.facts.map(([k, x]) => [k, v[x] ?? ''] as [string, string]),
        cta: tpl.cta && v.link ? { label: fill(tpl.cta, v), href: v.link } : undefined, unsubscribe: unsub,
      })
      r = await send({ channel: 'email', to: n.to, subject: fill(tpl.subject, v), text, html, kind: ev, headers: unsub ? { 'List-Unsubscribe': `<${unsub.replace('/unsubscribe?', '/api/unsubscribe?')}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined })
    } else if (n.channel === 'push') {
      r = await sendPushTo(n.learnerId!, { title: fill(tpl.subject, v), body: fill(tpl.sms.trim() ? tpl.sms : tpl.heading, v).replace(/\s*https?:\/\/\S+/g, '').slice(0, 200), url: v.link ?? `${site}/learn`, tag: n.key.split(':').slice(0, 2).join(':'), icon: pushIcon }, ev)
    } else {
      r = await send({ channel: 'sms', to: n.to, text: fill(tpl.sms, v).slice(0, 480), kind: ev })
    }
    if (r.ok) {
      await finish('sent', { sentAt: iso(new Date()), messageId: r.id, attempts: n.attempts + 1, error: '' })
      await ctx.after?.()
      out.sent++
    } else if (n.attempts < BACKOFF_MIN.length) {
      await finish('pending', { attempts: n.attempts + 1, error: r.error ?? '', messageId: r.id, sendAt: iso(new Date(now.getTime() + BACKOFF_MIN[n.attempts] * MIN)) })
      out.retry++
    } else {
      await finish('failed', { attempts: n.attempts + 1, error: r.error ?? '', messageId: r.id })
      out.failed++
    }
  }
  return out
}

/** دورة كاملة: جدولة ثم إرسال — يستدعيها المشغّل الدوري وزر «شغّل الآن» */
export async function runNotifications(now = new Date()) {
  const cfg = await notifySettings()
  const queued = await planScan(now, cfg)
  const r = await dispatch(now)
  return { queued, ...r }
}

