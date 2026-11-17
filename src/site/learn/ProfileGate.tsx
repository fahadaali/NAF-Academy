/* قفل «أكمل بياناتك» — في صفحة الدورة وصفحة الدرس للمسجّل بلا بياناته الإلزامية (src/lib/identity.ts).
   القفل نفسه على الخادم (learnerCourse ← حالة profile)؛ هذا شرحه ورابط إكماله، ويعود بعد الحفظ إلى حيث كان */
import { IDENTITY_LABEL, type IdentityField } from '@/lib/identity'

export function ProfileGate({ gaps, next, className }: { gaps: IdentityField[]; next: string; className?: string }) {
  return (
    <section className={className} aria-labelledby="gate-h">
      <strong id="gate-h">أكمل بياناتك لتبدأ الدورة</strong>
      <span>لكل متدرب حساب واحد باسمه ورقم هويته — تُطبع على شهادته، ولا يُشارَك الحساب. ينقصك: {gaps.map((g) => IDENTITY_LABEL[g]).join('، ')}.</span>
      <a className="btn" href={`/learn/profile?next=${encodeURIComponent(next)}`}>أكمل بياناتي</a>
    </section>
  )
}
