import 'server-only'
/* الشهادات — فحص الشروط، والطلب «بانتظار المراجعة» أو الإصدار التلقائي، والإصدار بلقطة ثابتة وملف PDF،
   ثم رسالة «صدرت شهادتك». يُستدعى الفحص بعد كل تقدّم (onProgress) ومن زر «أعد الفحص» في اللوحة. */
import { randomInt, randomUUID } from 'node:crypto'
import { and, asc, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import { db, schema as s } from '../db'
import { putObject, getObject } from '../storage'
import { siteUrl } from '../site'
import { audit } from '../audit'
import { certCode, DEFAULT_DESIGN, evaluateRules, mergeDesign, mergeRules, type CertDesign } from '@/lib/certificate'
import { formatHijri } from '@/lib/dates'
import { certificatePdf, type CertBrand } from './pdf'
import { brandView, logoBytes } from '../brand'
import { hasLogo, pick } from '@/lib/brand'
import { inList } from '@/server/db/limits'

const nowIso = () => new Date().toISOString()

/** القالب المعتمد لدورة: قالبها إن وُجد، وإلا الافتراضي */
async function designFor(templateId: string | null): Promise<{ id: string | null; design: CertDesign }> {
  const rows = await db.select().from(s.certificateTemplates).where(isNull(s.certificateTemplates.deletedAt)).orderBy(desc(s.certificateTemplates.isDefault), asc(s.certificateTemplates.createdAt))
  const t = rows.find((r) => r.id === templateId) ?? rows[0]
  return t ? { id: t.id, design: mergeDesign(t.design) } : { id: null, design: DEFAULT_DESIGN }
}

/** أرقام المتدرب في الدورة وتقييم الشروط */
export async function evaluate(learnerId: string, courseId: string) {
  const [course] = await db.select().from(s.courses).where(eq(s.courses.id, courseId))
  if (!course) return null
  const rules = mergeRules(course.certificate)
  const lessons = await db.select({ id: s.lessons.id, type: s.lessons.type }).from(s.lessons).innerJoin(s.modules, eq(s.modules.id, s.lessons.moduleId)).where(eq(s.modules.courseId, courseId))
  const ids = lessons.map((l) => l.id)
  const [prog, att] = ids.length
    ? await Promise.all([
      db.select({ lessonId: s.lessonProgress.lessonId }).from(s.lessonProgress).where(and(eq(s.lessonProgress.learnerId, learnerId), inList(s.lessonProgress.lessonId, ids), isNotNull(s.lessonProgress.completedAt))),
      db.select({ lessonId: s.attendance.lessonId }).from(s.attendance).where(and(eq(s.attendance.learnerId, learnerId), inList(s.attendance.lessonId, ids))),
    ])
    : [[], []]
  const done = new Set(prog.map((p) => p.lessonId))
  const here = new Set(att.map((a) => a.lessonId))
  const session = (t: string) => t === 'live' || t === 'onsite'
  const completable = lessons.filter((l) => !session(l.type))
  const sessions = lessons.filter((l) => session(l.type))
  const quizzes = lessons.filter((l) => l.type === 'quiz')
  const assignments = lessons.filter((l) => l.type === 'assignment')
  const r = evaluateRules(rules, {
    completable: completable.length, completed: completable.filter((l) => done.has(l.id)).length,
    sessions: sessions.length, attended: sessions.filter((l) => here.has(l.id)).length,
    quizzes: quizzes.length, quizzesPassed: quizzes.filter((l) => done.has(l.id)).length,
    assignments: assignments.length, assignmentsAccepted: assignments.filter((l) => done.has(l.id)).length,
  })
  return { course, rules, ...r }
}

/** يفحص المتدرب ويُنشئ طلب الشهادة إن استوفى — أو يصدرها فوراً إن كان الاعتماد تلقائياً */
export async function checkCertificate(learnerId: string, courseId: string, by = 'system') {
  /* status لا hasAccess: الإنجاز السابق لا يسقط بانتهاء الوصول — من استوفى الشروط تصدر له شهادته */
  const [en] = await db.select().from(s.enrollments).where(and(eq(s.enrollments.learnerId, learnerId), eq(s.enrollments.courseId, courseId), eq(s.enrollments.status, 'active')))
  if (!en) return null
  const ev = await evaluate(learnerId, courseId)
  if (!ev?.eligible) return null
  const [existing] = await db.select().from(s.certificates).where(and(eq(s.certificates.learnerId, learnerId), eq(s.certificates.courseId, courseId)))
  if (existing) return existing
  const [learner] = await db.select().from(s.learners).where(eq(s.learners.id, learnerId))
  const id = randomUUID()
  const ins = await db.insert(s.certificates).values({
    id, learnerId, courseId, name: learner?.name || learner?.email || '', courseTitle: ev.course.title.replace(/~\d/g, ''),
    hours: ev.course.hours, criteria: ev.criteria, templateId: ev.rules.templateId,
  }).onConflictDoNothing().returning()
  if (!ins.length) return null
  await audit(by, 'eligible', 'certificate', id, `${learner?.email} · ${ev.course.title}`)
  if (ev.rules.autoApprove) return issueCertificate(id, 'اعتماد تلقائي')
  return ins[0]
}

/** إصدار: رمز، ولقطة القالب، وملف PDF، ورسالة */
export async function issueCertificate(id: string, by: string) {
  const [c] = await db.select().from(s.certificates).where(eq(s.certificates.id, id))
  if (!c || c.status === 'issued' || c.status === 'revoked') return c ?? null
  const { id: tid, design } = await designFor(c.templateId)
  const issuedAt = nowIso()
  /* اللقطة تؤخذ عند الإصدار لا عند الاستيفاء: إن صحّح المتدرب اسمه أو عُدّلت الدورة قبل الاعتماد يظهر الصحيح */
  const [learner] = await db.select({ name: s.learners.name, email: s.learners.email, nameEn: s.learners.nameEn }).from(s.learners).where(eq(s.learners.id, c.learnerId))
  const [course] = await db.select({ title: s.courses.title, hours: s.courses.hours, titleEn: s.courses.titleEn }).from(s.courses).where(eq(s.courses.id, c.courseId))
  let code = ''
  for (let i = 0; i < 5 && !code; i++) {
    const k = certCode(randomInt)
    const [dup] = await db.select({ id: s.certificates.id }).from(s.certificates).where(eq(s.certificates.code, k))
    if (!dup) code = k
  }
  const [row] = await db.update(s.certificates).set({
    status: 'issued', code, issuedAt, design, templateId: tid, decidedBy: by, reason: '', updatedAt: issuedAt,
    name: learner?.name || c.name || learner?.email || '', courseTitle: course ? course.title.replace(/~\d/g, '') : c.courseTitle, hours: course?.hours ?? c.hours,
    nameEn: learner?.nameEn ?? '', courseTitleEn: course?.titleEn ?? '',
  })
    .where(and(eq(s.certificates.id, id), inArray(s.certificates.status, ['pending', 'rejected']))).returning()
  if (!row) return c
  /* الملف يُخزَّن بلا أن يوقف الإصدار: إن تعذّر الآن يُولَّد عند أول تنزيل — والسجل والرسالة يتمّان دائماً */
  try { await storePdf(row) } catch (e) { console.error('certificate pdf', e) }
  await audit(by, 'issue', 'certificate', id, `${code} · ${row.name}`)
  /* الرسالة والإنجاز مستقلان: فشل أحدهما لا يمنع الآخر */
  try {
    const { onCertificate } = await import('../notify/engine')
    await onCertificate(row.id)
  } catch (e) {
    console.error('certificate notify', e)
  }
  try {
    const { evaluateAchievements } = await import('../achievements')
    await evaluateAchievements(row.learnerId)
  } catch (e) {
    console.error('certificate achievements', e)
  }
  return row
}

const dateAr = (iso: string) => new Intl.DateTimeFormat('ar-SA-u-nu-latn-ca-gregory', { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso))
const hijriAr = (iso: string) => `${formatHijri(iso)} ${new Intl.DateTimeFormat('ar-SA-u-nu-latn-ca-islamic-umalqura', { timeZone: 'Asia/Riyadh', year: 'numeric' }).format(new Date(iso)).replace(/[^\d]/g, '')}`

const dateEn = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso))

export const verifyUrl = (code: string) => `${siteUrl() ?? ''}/certificates/${code}`

/** الهوية للشهادة — شعار الأكاديمية بالنسخة الفاتحة للقالب العاجي والداكنة للكحلي */
export async function certBrand(tone: CertDesign['tone']): Promise<CertBrand> {
  const b = await brandView()
  const t = tone === 'night' ? 'dark' : 'light'
  /* شعار الأكاديمية وحده — الكامل إن رُفع، وإلا صيغة الشريط */
  const full = hasLogo(b.lockup)
  const logo = await logoBytes(pick(full ? b.lockup : b.academy, t))
  return { name: b.name, tagline: b.tagline, companyName: b.companyName, showName: b.showName, logo, full }
}

async function renderPdf(c: typeof s.certificates.$inferSelect, design?: CertDesign) {
  const d = design ?? c.design ?? DEFAULT_DESIGN
  return certificatePdf(d, {
    name: c.name, course: c.courseTitle, hours: c.hours, date: dateAr(c.issuedAt ?? nowIso()), hijri: hijriAr(c.issuedAt ?? nowIso()),
    nameEn: c.nameEn, courseEn: c.courseTitleEn, dateEn: dateEn(c.issuedAt ?? nowIso()),
    code: c.code ?? 'NAF-XXXX-XXXX', verifyUrl: verifyUrl(c.code ?? ''),
  }, await certBrand(d.tone))
}

async function storePdf(c: typeof s.certificates.$inferSelect) {
  const bytes = await renderPdf(c)
  const key = `cert-${c.id}.pdf`
  await putObject(key, bytes, 'application/pdf')
  await db.update(s.certificates).set({ pdfKey: key }).where(eq(s.certificates.id, c.id))
  return bytes
}

/** ملف الشهادة: المخزّن، أو يُعاد توليده من اللقطة إن غاب */
export async function certificatePdfBytes(c: typeof s.certificates.$inferSelect) {
  if (c.pdfKey) {
    const b = await getObject(c.pdfKey)
    if (b) return b
  }
  return storePdf(c)
}

export async function regeneratePdf(id: string) {
  const [c] = await db.select().from(s.certificates).where(eq(s.certificates.id, id))
  if (c?.status === 'issued') await storePdf(c)
}

/** إعادة فحص كل مسجّلي دورة — بعد تعديل شروطها */
export async function recheckCourse(courseId: string, by: string) {
  const en = await db.select({ learnerId: s.enrollments.learnerId }).from(s.enrollments).where(and(eq(s.enrollments.courseId, courseId), eq(s.enrollments.status, 'active')))
  let n = 0
  for (const e of en) if (await checkCertificate(e.learnerId, courseId, by)) n++
  return n
}

export async function certificateByCode(code: string) {
  const [r] = await db.select({ c: s.certificates, slug: s.courses.slug }).from(s.certificates).innerJoin(s.courses, eq(s.courses.id, s.certificates.courseId))
    .where(eq(s.certificates.code, code.trim().toUpperCase()))
  return r ?? null
}

/** بيانات العرض في الصفحة (مع رمز QR بصيغة SVG) */
export async function viewData(c: typeof s.certificates.$inferSelect) {
  const QRCode = (await import('qrcode')).default
  const at = c.issuedAt ?? nowIso()
  const qrSvg = c.code
    ? (await QRCode.toString(verifyUrl(c.code), { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })).replace(/fill="#ffffff"/gi, 'fill="transparent"').replace(/#000000/g, 'currentColor')
    : undefined
  return { name: c.name, course: c.courseTitle, hours: c.hours, date: dateAr(at), hijri: hijriAr(at), code: c.code ?? 'NAF-XXXX-XXXX', qrSvg, nameEn: c.nameEn, courseEn: c.courseTitleEn, dateEn: dateEn(at) }
}

export { dateAr, hijriAr }

/** روابط صور القالب (الخلفية والتوقيعات) بمعرّفاتها — لعرض الشهادة في الصفحة مطابقاً لملف PDF */
export async function certImages(design: CertDesign | null | undefined): Promise<Record<string, string>> {
  const ids = [design?.backgroundId, ...(design?.signatories ?? []).map((x) => x.signatureId)].filter((x): x is string => !!x)
  if (!ids.length) return {}
  const rows = await db.select({ id: s.media.id, key: s.media.key }).from(s.media).where(inList(s.media.id, ids))
  return Object.fromEntries(rows.map((m) => [m.id, `/media/${m.key}`]))
}
