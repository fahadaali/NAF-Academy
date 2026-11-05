import { notFound } from 'next/navigation'
import { courseDetail } from '@/server/queries'
import { plain } from '@/motion/kashida'
import { Words } from '@/components/Words'

export default async function Enroll({ params }: { params: Promise<{ slug: string }> }) {
  const d = await courseDetail((await params).slug)
  if (!d) notFound()
  return (
    <section data-surface="night" style={{ minBlockSize: '80svh', background: 'var(--scene-bg)', color: 'var(--scene-text)', display: 'grid', placeItems: 'center', padding: 'calc(var(--header-h) + 40px) var(--gutter) 60px' }}>
      <div style={{ display: 'grid', gap: 18, justifyItems: 'center', textAlign: 'center', maxInlineSize: 560 }}>
        <span className="eyebrow">{plain(d.course.title)}</span>
        <Words as="h1" text="التسجيل الإلكتروني يُفت~3ح قريباً." className="scene-title" />
        <p style={{ color: 'var(--scene-muted)' }}>نُجهّز الدفع والتسجيل الفوري. حتى ذلك الحين يسعدنا تسجيلك أو تسجيل فريقك عبر التواصل المباشر.</p>
        <a className="btn" href="/#corporate">تواصل معنا</a>
        <a href={`/courses/${d.course.slug}`} style={{ color: 'var(--scene-muted)' }}>العودة إلى الدورة</a>
      </div>
    </section>
  )
}
