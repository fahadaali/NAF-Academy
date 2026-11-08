/* قبول دعوة البرنامج — رابط موقّع من بريد المدعو يكمل منه بياناته فيُسجَّل ويدخل مساحة التعلّم.
   الرابط لمرة واحدة، ويبطل بإعادة الإرسال أو الإلغاء أو بعد مدته. */
import type { Metadata } from 'next'
import { eq } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { inviteTarget } from '@/server/invites'
import { brandView } from '@/server/brand'
import { formatDay } from '@/lib/dates'
import { plain } from '@/motion/kashida'
import { InviteForm } from './InviteForm'
import v from './invite.module.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'قبول الدعوة', robots: { index: false, follow: false }, referrer: 'no-referrer' }

export default async function Invite({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t = '' } = await searchParams
  const [brand, target] = await Promise.all([brandView(), inviteTarget(t)])
  if (!target) {
    return (
      <section className={v.card} role="alert">
          <h1>الرابط غير صالح</h1>
          <p className={v.lead}>الرابط منتهٍ أو استُخدم من قبل، أو أُرسلت بعده دعوة أحدث. اطلب دعوة جديدة من إدارة البرنامج — وإن كنت قبلتها فادخل ببريدك.</p>
          <a className="btn ghost" href="/login?next=/learn">الدخول إلى دوراتي</a>
      </section>
    )
  }
  const { invite, course, cohort } = target
  /* بريد له حساب قائم: لا تُعرض بياناته ولا تُطلب — الرابط قد يكون بيد غير صاحبه (يراه الفريق)، والدخول برمزه بعد القبول */
  const [known] = await db.select({ id: s.learners.id }).from(s.learners).where(eq(s.learners.email, invite.email))
  return (
    <section className={v.card} aria-labelledby="inv-h">
        <span className="eyebrow">دعوة من {brand.name}</span>
        <h1 id="inv-h">{plain(course.title)}</h1>
        <dl className={v.facts}>
          {cohort && <div><dt>الدفعة</dt><dd>{cohort.title}</dd></div>}
          {(cohort?.startsAt ?? course.startsAt) && <div><dt>تبدأ</dt><dd className="num">{formatDay((cohort?.startsAt ?? course.startsAt)!)}</dd></div>}
          <div><dt>الدعوة صالحة حتى</dt><dd className="num">{formatDay(invite.expiresAt)}</dd></div>
        </dl>
        {known ? (
          <>
            <p className={v.lead}>لديك حساب بهذا البريد. اقبل الدعوة ليُفعَّل تسجيلك، ثم ادخل برمز يصلك لتبلغ مساحة التعلّم.</p>
            <InviteForm token={t} email={invite.email} existing />
          </>
        ) : (
          <>
            <p className={v.lead}>أكمل بياناتك ليُفعَّل تسجيلك وتدخل مساحة التعلّم مباشرة.</p>
            <InviteForm token={t} email={invite.email} name={invite.name} phone={invite.phone} />
          </>
        )}
        <p className={v.note}>بقبول الدعوة توافق على <a href="/policies">الشروط والخصوصية</a>.</p>
    </section>
  )
}
