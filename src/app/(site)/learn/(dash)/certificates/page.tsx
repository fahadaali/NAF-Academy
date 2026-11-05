import { desc, eq } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { currentLearner } from '@/server/learner-auth'
import { verifyUrl, viewData } from '@/server/certificates'
import { CertificateView } from '@/components/CertificateView'
import { DEFAULT_DESIGN, linkedinUrl } from '@/lib/certificate'
import { CopyLink } from '@/site/CopyLink'
import st from '@/site/learn/learn.module.css'

const LABEL: Record<string, string> = { pending: 'استوفيت الشروط — بانتظار اعتماد الأكاديمية', rejected: 'لم تُعتمد', revoked: 'أُلغيت' }

export default async function MyCertificates() {
  const me = (await currentLearner())!
  const rows = await db.select().from(s.certificates).where(eq(s.certificates.learnerId, me.id)).orderBy(desc(s.certificates.updatedAt))
  if (!rows.length)
    return <div className={st.empty}><strong>لا شهادات بعد.</strong><span>تصدر الشهادة بعد استيفاء متطلبات الدورة واعتمادها — تابع تقدّمك من صفحة كل دورة.</span><a className="btn" href="/learn">دوراتي</a></div>
  const views = await Promise.all(rows.map(async (c) => ({ c, v: c.status === 'issued' ? await viewData(c) : null })))
  return (
    <div className={st.grid}>
      {views.map(({ c, v }) => (
        <article key={c.id} className={st.course}>
          {v && <a href={`/certificates/${c.code}`} aria-label={`صفحة شهادة ${c.courseTitle}`}><CertificateView design={c.design ?? DEFAULT_DESIGN} data={v} /></a>}
          <h2>{c.courseTitle}</h2>
          {c.status === 'issued' ? (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <a className="btn" href={`/certificates/${c.code}/pdf?download`}>تنزيل PDF</a>
              <a className="btn ghost" href={linkedinUrl({ course: c.courseTitle, code: c.code!, url: verifyUrl(c.code!), issuedAt: c.issuedAt! })} target="_blank" rel="noopener noreferrer">أضف إلى LinkedIn</a>
              <CopyLink url={verifyUrl(c.code!)} label="نسخ رابط التحقق" />
            </div>
          ) : (
            <p className={st.next}>{LABEL[c.status]}{c.reason ? ` — ${c.reason}` : ''}</p>
          )}
        </article>
      ))}
    </div>
  )
}
