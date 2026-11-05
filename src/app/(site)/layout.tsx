/* الغلاف العام للموقع: الشريط، وطبقة الحركة، والتذييل — المحتوى من القاعدة. */
import { Header } from '@/components/Header'
import { brandView } from '@/server/brand'
import { Footer } from '@/components/Footer'
import { MotionRoot } from '@/components/MotionRoot'
import { Beacon } from '@/components/Beacon'
import { menuOf } from '@/content/home-defaults'
import { homeContent } from '@/server/queries'

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [home, brand] = await Promise.all([homeContent(), brandView()])
  return (
    <>
      <MotionRoot />
      <Beacon />
      <Header nav={menuOf(home)} brand={brand} />
      <main id="main">{children}</main>
      <Footer title={home.footer.title} cta={home.footer.cta} brand={brand} />
    </>
  )
}
