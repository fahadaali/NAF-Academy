import { auditEntries } from '@/admin/data'
import { PageHead } from '@/admin/ui/kit'
import p from '@/admin/ui/panel.module.css'

const ACTION: Record<string, string> = {
  create: 'إنشاء', update: 'تعديل', status: 'تغيير حالة', duplicate: 'نسخ', reorder: 'ترتيب', trash: 'حذف', restore: 'استرجاع',
  purge: 'حذف نهائي', upload: 'رفع', seed: 'بذر',
}
const ENTITY: Record<string, string> = {
  course: 'دورة', track: 'مسار', instructor: 'مدرب', media: 'صورة', home: 'الرئيسية', site: 'الموقع', pages: 'الصفحات العامة', coupon: 'كوبون',
  promotion: 'عرض عام', cohort: 'دفعة', enrollment: 'تسجيل', order: 'طلب', settings: 'الإعدادات', certificate_template: 'قالب شهادة', certificate: 'شهادة',
}
/** محرّر العنصر — منه يُفتح «السجل» لمقارنة النسخة واسترجاعها */
const EDITOR: Record<string, (id: string) => string> = {
  course: (id) => `/admin/courses/${id}`, track: (id) => `/admin/tracks/${id}`, instructor: (id) => `/admin/instructors/${id}`,
  coupon: (id) => `/admin/coupons/${id}`, promotion: () => '/admin/promotions', home: () => '/admin/home', pages: () => '/admin/pages',
  certificate_template: (id) => `/admin/certificates/templates/${id}`,
}

export default async function Audit() {
  const rows = await auditEntries(300)
  return (
    <>
      <PageHead title="سجل التعديلات" sub="من غيّر ماذا ومتى — آخر 300 عملية" />
      <table className={p.table}>
        <thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>العنصر</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className={`${p.muted} num`}>{new Date(r.at).toLocaleString('ar-SA-u-nu-latn', { timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short' })}</td>
              <td>{r.actor}</td>
              <td>{ACTION[r.action] ?? r.action}</td>
              <td><span className={p.muted}>{ENTITY[r.entity] ?? r.entity} ·</span> {r.summary}
                {!!r.versioned && EDITOR[r.entity] && r.action !== 'purge' ? <> · <a className={p.rowLink} href={EDITOR[r.entity](r.entityId)}>النسخة في السجل ←</a></> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
