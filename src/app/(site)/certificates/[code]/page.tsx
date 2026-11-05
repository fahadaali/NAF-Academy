import type { Metadata } from 'next'
import { brandView } from '@/server/brand'
import { notFound } from 'next/navigation'
import { certificateByCode, verifyUrl, viewData } from '@/server/certificates'
import { CertificateView } from '@/components/CertificateView'
import { DEFAULT_DESIGN, linkedinUrl } from '@/lib/certificate'
import { CopyLink } from '@/site/CopyLink'
import st from '@/site/certificate.module.css'

export const dynamic = 'force-dynamic'

type P = { params: Promise<{ code: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const r = await certificateByCode((await params).code)
  if (!r || (r.c.status !== 'issued' && r.c.status !== 'revoked')) return { title: 'شهادة غير موجودة', robots: { index: false } }
  return { title: `شهادة ${r.c.courseTitle} — ${r.c.name}`, description: `شهادة إتمام صادرة عن ${(await brandView()).name} برقم ${r.c.code}`, robots: { index: false } }
}

export default async function Certificate({ params }: P) {
  const r = await certificateByCode((await params).code)
  if (!r || !r.c.code || (r.c.status !== 'issued' && r.c.status !== 'revoked')) notFound()
  const { c } = r
  const [data, brand] = await Promise.all([viewData(c), brandView()])
  const valid = c.status === 'issued'
  const url = verifyUrl(c.code!)
  return (
    <div className={`wrap ${st.page}`}>
      <div className={st.status} data-valid={valid ? '1' : '0'} role="status">
        <span aria-hidden="true">{valid ? '✓' : '✕'}</span>
        <div>
          <h1 className={st.statusTitle}>{valid ? `شهادة صحيحة صادرة عن ${brand.name}` : 'هذه الشهادة ملغاة'}</h1>
          <small>{valid ? `تحقّقنا من الرقم ${c.code}` : c.reason || `ألغتها ${brand.name}`}</small>
        </div>
      </div>
      <div className={st.sheet} data-revoked={valid ? '0' : '1'}>
        <CertificateView design={c.design ?? DEFAULT_DESIGN} data={data} brand={brand} />
      </div>
      <dl className={`${st.facts} num`}>
        <div><dt>الاسم</dt><dd>{c.name}</dd></div>
        <div><dt>الدورة</dt><dd>{c.courseTitle}</dd></div>
        {c.hours > 0 && <div><dt>الساعات التدريبية</dt><dd>{c.hours}</dd></div>}
        <div><dt>تاريخ الإصدار</dt><dd>{data.date} · {data.hijri}</dd></div>
        <div><dt>رقم الشهادة</dt><dd dir="ltr">{c.code}</dd></div>
      </dl>
      {valid && (
        <div className={st.actions}>
          <a className="btn" href={`/certificates/${c.code}/pdf?download`}>تنزيل PDF</a>
          <a className="btn ghost" href={linkedinUrl({ course: c.courseTitle, code: c.code!, url, issuedAt: c.issuedAt! })} target="_blank" rel="noopener noreferrer">أضف إلى LinkedIn</a>
          <CopyLink url={url} />
          <a className={st.badge} href={`/certificates/${c.code}/badge`}>Open Badge</a>
        </div>
      )}
    </div>
  )
}
