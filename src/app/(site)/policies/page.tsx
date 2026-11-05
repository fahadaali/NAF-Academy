/* السياسات — الاسترداد من «إعدادات الدفع» (المصدر نفسه الذي يوافق عليه المشتري عند التسجيل)،
   والشروط والخصوصية من «الصفحات العامة». الفارغ لا يظهر: لا نص قانوني افتراضي. */
import type { Metadata } from 'next'
import { PageHero } from '@/site/PageHero'
import { Prose } from '@/components/Prose'
import { pagesContent } from '@/server/queries'
import { paymentSettings } from '@/server/settings'
import s from '@/site/policies.module.css'

export const revalidate = 300

export async function generateMetadata(): Promise<Metadata> {
  const p = await pagesContent()
  return { title: p.policies.eyebrow || 'السياسات', alternates: { canonical: '/policies' } }
}

export default async function Policies() {
  const [{ policies: p }, pay] = await Promise.all([pagesContent(), paymentSettings()])
  const parts = [
    { id: 'refund', title: 'سياسة الاسترداد', text: pay.refundPolicy },
    { id: 'terms', title: 'الشروط والأحكام', text: p.terms },
    { id: 'privacy', title: 'سياسة الخصوصية', text: p.privacy },
  ].filter((x) => x.text.trim())
  return (
    <>
      <PageHero eyebrow={p.eyebrow} title={p.title} body={p.body || undefined} />
      <div className={`wrap ${s.page}`}>
        {parts.length > 1 && (
          <nav aria-label="أقسام السياسات" className={s.toc}>
            {parts.map((x) => <a key={x.id} href={`#${x.id}`}>{x.title}</a>)}
          </nav>
        )}
        <div className={`${s.parts} stagger reveal`}>
          {parts.map((x) => (
            <section key={x.id} id={x.id} className={s.part} aria-labelledby={`${x.id}-h`}>
              <h2 id={`${x.id}-h`}>{x.title}</h2>
              <Prose text={x.text} />
            </section>
          ))}
        </div>
      </div>
    </>
  )
}
