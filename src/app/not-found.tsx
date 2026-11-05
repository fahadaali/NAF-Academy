/* المسار غير الموجود خارج مجموعة الموقع — بالشريط والتذييل نفسيهما */
import type { Metadata } from 'next'
import { brandView } from '@/server/brand'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { MotionRoot } from '@/components/MotionRoot'
import { nav } from '@/content/seed'
import { homeContent } from '@/server/queries'
import { NotFoundView } from '@/site/NotFoundView'

export const metadata: Metadata = { title: 'الصفحة غير موجودة', robots: { index: false } }

export default async function NotFound() {
  const [home, brand] = await Promise.all([homeContent(), brandView()])
  return (
    <>
      <MotionRoot />
      <Header nav={nav} brand={brand} />
      <main id="main"><NotFoundView /></main>
      <Footer title={home.footer.title} cta={home.footer.cta} brand={brand} />
    </>
  )
}
