/* الغلاف العام للموقع: الشريط، وطبقة الحركة، والتذييل — المحتوى من القاعدة. */
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { MotionRoot } from '@/components/MotionRoot'
import { nav } from '@/content/seed'
import { homeContent } from '@/server/queries'

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const home = await homeContent()
  return (
    <>
      <MotionRoot />
      <Header nav={nav} />
      <main id="main">{children}</main>
      <Footer title={home.footer.title} cta={home.footer.cta} />
    </>
  )
}
