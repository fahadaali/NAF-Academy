import { asc, count, desc, eq, isNull } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { requirePermission } from '@/server/auth'
import { CertificateView } from '@/components/CertificateView'
import { mergeDesign } from '@/lib/certificate'
import { Badge, PageHead } from '@/admin/ui/kit'
import p from '@/admin/ui/panel.module.css'

const SAMPLE = { name: 'اسم المتدرب', course: 'اسم الدورة', hours: 12, date: '5 نوفمبر 2026', hijri: '14 جمادى الأولى 1448', code: 'NAF-DEMO-2026' }

export default async function Templates() {
  await requirePermission('certificates.manage')
  const [rows, used] = await Promise.all([
    db.select().from(s.certificateTemplates).where(isNull(s.certificateTemplates.deletedAt)).orderBy(desc(s.certificateTemplates.isDefault), asc(s.certificateTemplates.createdAt)),
    db.select({ id: s.certificates.templateId, n: count() }).from(s.certificates).where(eq(s.certificates.status, 'issued')).groupBy(s.certificates.templateId),
  ])
  const u = new Map(used.map((x) => [x.id, x.n]))
  return (
    <>
      <PageHead title="قوالب الشهادات" sub="الشهادة الصادرة تحفظ قالبها لحظة الإصدار — تعديل القالب لا يغيّر ما صدر" actions={<><a className="btn ghost" href="/admin/certificates">الشهادات</a><a className="btn" href="/admin/certificates/templates/new">+ قالب جديد</a></>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 }}>
        {rows.map((t) => (
          <a key={t.id} href={`/admin/certificates/templates/${t.id}`} style={{ display: 'grid', gap: 10 }}>
            <CertificateView design={mergeDesign(t.design)} data={SAMPLE} />
            <span style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
              <strong>{t.name}</strong>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{t.isDefault && <Badge tone="open">الافتراضي</Badge>}<span className={`${p.muted} num`}>{u.get(t.id) ?? 0} صادرة</span></span>
            </span>
          </a>
        ))}
      </div>
    </>
  )
}
