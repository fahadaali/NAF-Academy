import type { Metadata } from 'next'
import { brandView } from '@/server/brand'
import { redirect } from 'next/navigation'
import { certificateByCode } from '@/server/certificates'
import { Words } from '@/components/Words'
import st from '@/site/certificate.module.css'

export const dynamic = 'force-dynamic'
export async function generateMetadata(): Promise<Metadata> {
  return { title: 'التحقق من شهادة', description: `تحقّق من صحة شهادة صادرة عن ${(await brandView()).name} برقمها.` }
}

export default async function Verify({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const raw = ((await searchParams).code ?? '').trim().toUpperCase().replace(/\s+/g, '')
  let missing = false
  if (raw) {
    const code = /^NAF-?[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(raw) ? raw.replace(/^NAF-?(\w{4})-?(\w{4})$/, 'NAF-$1-$2') : raw
    const r = await certificateByCode(code)
    if (r && (r.c.status === 'issued' || r.c.status === 'revoked')) redirect(`/certificates/${r.c.code}`)
    missing = true
  }
  return (
    <div className={`wrap ${st.verify}`}>
      <span className="eyebrow">الشهادات</span>
      <Words as="h1" text="تحقّ~3ق من شهادة" className={st.h1} />
      <p>اكتب رقم الشهادة المطبوع أسفلها، أو امسح رمز QR الموجود عليها.</p>
      <form className={st.form} action="/certificates/verify">
        <input name="code" dir="ltr" defaultValue={raw} placeholder="NAF-XXXX-XXXX" aria-label="رقم الشهادة" autoComplete="off" spellCheck={false} required />
        <button className="btn">تحقّق</button>
      </form>
      {missing && <p className={st.miss} role="alert">لا توجد شهادة صادرة بهذا الرقم. تأكّد من الأحرف والأرقام.</p>}
    </div>
  )
}
