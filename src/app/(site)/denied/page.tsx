import type { Metadata } from 'next'
import { PageHero } from '@/site/PageHero'

export const metadata: Metadata = { title: 'لا صلاحية', robots: { index: false } }

const REASON: Record<string, string> = {
  inactive: 'حسابك في لوحة الأكاديمية موقوف من مالك المنصة.',
  pending: 'حسابك بلا دور بعد — اطلب من مالك المنصة أن يمنحك دوراً من «الفريق والصلاحيات».',
}

export default async function Denied({ searchParams }: { searchParams: Promise<{ r?: string; m?: string }> }) {
  const { r = '', m } = await searchParams
  return (
    <PageHero eyebrow="لوحة الأكاديمية" title="لا يمكن الدخول." body={REASON[r] ?? m?.slice(0, 200) ?? 'لا تملك صلاحية الوصول.'}>
      <a className="btn" href="/admin/login">صفحة الدخول</a>
    </PageHero>
  )
}
