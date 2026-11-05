/* «الصفحة غير موجودة» بهوية الأكاديمية — كشيدة متحركة وطرق للعودة */
import { Words } from '@/components/Words'
import { LogoMark } from '@/components/Logo'
import { brandView } from '@/server/brand'

export async function NotFoundView() {
  const brand = await brandView()
  return (
    <section className="wrap" style={{ minBlockSize: '72svh', display: 'grid', placeContent: 'center', justifyItems: 'center', gap: 18, textAlign: 'center', paddingBlock: 'calc(var(--header-h) + 50px) 90px' }}>
      <LogoMark pair={brand.academy} alt={brand.name} height={72} />
      <span className="eyebrow num">404</span>
      <Words as="h1" text="هذه الصفحة لم تُكت~4ب بعد." className="scene-title" />
      <p style={{ color: 'var(--muted)', maxInlineSize: '44ch', lineHeight: 1.9 }}>ربما نُقلت الدورة أو انتهى رابطها. ابدأ من الدورات أو من الرئيسية.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <a className="btn" href="/courses">تصفّح الدورات</a>
        <a className="btn ghost" href="/">الرئيسية</a>
      </div>
    </section>
  )
}
