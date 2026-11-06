import Link from 'next/link'
import { adminLists, auditEntries, needsAttention } from '@/admin/data'
import { setupStatus } from '@/server/setup'
import { currentStaff, staffCan } from '@/server/auth'
import { PageHead, Badge } from '@/admin/ui/kit'
import { STATUS_LABEL } from '@/admin/courses/labels'
import { resolveStatus } from '@/lib/course-meta'
import { formatDay } from '@/lib/dates'
import p from '@/admin/ui/panel.module.css'

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { denied } = await searchParams
  const [canAudit, canWrite] = await Promise.all([staffCan('audit.read'), staffCan('content.write')])
  const [{ courses, tracks, instructors, media }, log, attention, setup] = await Promise.all([adminLists(), canAudit ? auditEntries(8) : Promise.resolve([]), needsAttention(), setupStatus()])
  const me = await currentStaff()
  const now = new Date()
  const live = courses.filter((c) => ['open', 'soon', 'full'].includes(resolveStatus(c.status, c.publishAt, now)))
  const drafts = courses.filter((c) => c.status === 'draft')
  /* عرض ساري الآن: في نافذته من البداية إلى النهاية (العروض العامة في صفحتها) */
  const sales = courses.filter((c) => c.compareAt && c.compareAt > c.price && (!c.saleStartsAt || new Date(c.saleStartsAt) <= now) && (!c.saleEndsAt || new Date(c.saleEndsAt) > now))
  const upcoming = courses.filter((c) => c.startsAt && new Date(c.startsAt) > now).sort((a, b) => a.startsAt!.localeCompare(b.startsAt!)).slice(0, 5)
  return (
    <>
      <PageHead title="نظرة عامة" sub="حال المحتوى المنشور الآن" actions={canWrite ? <Link className="btn" href="/admin/courses/new">+ دورة جديدة</Link> : null} />
      {denied && <p role="alert" className={p.alert}>لا تملك صلاحية هذه الصفحة أو العملية. اطلبها من مالك الحساب.</p>}
      {me?.role === 'instructor' && !me.instructorId && <p role="status" className={p.notice}>حسابك غير مربوط بملف مدرب بعد — لن تظهر لك دورات حتى يربطه مالك الحساب من «الفريق والصلاحيات».</p>}
      {setup.migrations.pending.length > 0 && <p role="alert" className={p.alert}>للقاعدة <span className="num">{setup.migrations.pending.length}</span> ترحيل لم يُطبَّق بعد (تُطبَّق وحدها خلال 5 دقائق) — <a href="/setup">طبّقها الآن ←</a></p>}
      {attention > 0 && <p role="status" className={p.alert}><span className="num">{attention}</span> عملية تحتاج تدخّلاً في آخر أسبوعين (تسجيل لم يُنسخ، مشترٍ مسجّل من قبل…) — <a href="/admin/audit?action=needs_attention">راجعها ←</a></p>}
      <div className={p.stats}>
        <Link href="/admin/courses" className={p.stat}><strong data-count>{live.length}</strong><span>دورة ظاهرة للتسجيل</span></Link>
        <Link href="/admin/courses" className={p.stat}><strong data-count>{drafts.length}</strong><span>مسودة</span></Link>
        <Link href="/admin/courses" className={p.stat}><strong data-count>{sales.length}</strong><span>عرض ساري</span></Link>
        <Link href="/admin/tracks" className={p.stat}><strong data-count>{tracks.length}</strong><span>مسار</span></Link>
        <Link href="/admin/instructors" className={p.stat}><strong data-count>{instructors.length}</strong><span>مدرب</span></Link>
        <Link href="/admin/media" className={p.stat}><strong data-count>{media.length}</strong><span>صورة</span></Link>
      </div>
      <div className={p.cards}>
        <section>
          <h2 style={{ fontSize: 18, marginBlockEnd: 10 }}>تبدأ قريباً</h2>
          <div className={p.scroll}><table className={p.table}><tbody>
            {upcoming.length === 0 && <tr><td className={p.muted}>لا مواعيد قادمة.</td></tr>}
            {upcoming.map((c) => (
              <tr key={c.id}>
                <td><Link className={p.rowLink} href={`/admin/courses/${c.id}`}>{c.title}</Link><div className={`${p.muted} num`}>{formatDay(c.startsAt!)}</div></td>
                <td><Badge tone={c.status}>{STATUS_LABEL[c.status]}</Badge></td>
              </tr>
            ))}
          </tbody></table></div>
        </section>
        <section>
          <h2 style={{ fontSize: 18, marginBlockEnd: 10 }}>آخر التعديلات</h2>
          <div className={p.scroll}><table className={p.table}><tbody>
            {log.map((e) => (
              <tr key={e.id}><td><strong>{e.actor}</strong> <span className={p.muted}>· {e.summary}</span><div className={`${p.muted} num`}>{new Date(e.at).toLocaleString('ar-SA-u-nu-latn', { timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short' })}</div></td></tr>
            ))}
          </tbody></table></div>
          {canAudit && <Link href="/admin/audit" className={p.muted} style={{ display: 'inline-block', marginBlockStart: 8 }}>السجل كاملاً ←</Link>}
        </section>
      </div>
    </>
  )
}
