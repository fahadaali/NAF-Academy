import type { Metadata } from 'next'
import { PageHero } from '@/site/PageHero'

export const metadata: Metadata = { title: 'لا صلاحية', robots: { index: false } }

const REASON: Record<string, string> = {
  inactive: 'حسابك في لوحة الأكاديمية موقوف من مالك المنصة.',
  pending: 'سُجّل دخولك، وحسابك بانتظار أن يمنحك مالك المنصة دوراً من «الفريق والصلاحيات».',
  not_member: 'لا سجلّ لك في لوحة الأكاديمية. اطلب الدعوة من مالك المنصة.',
  bad_state: 'انقطعت محاولة الدخول — أعد المحاولة من جديد.',
  auth_failed: 'تعذّر التحقق من الدخول — أعد المحاولة.',
}

export default async function Denied({ searchParams }: { searchParams: Promise<{ r?: string; m?: string }> }) {
  const { r = '', m } = await searchParams
  return (
    <PageHero eyebrow="لوحة الأكاديمية" title="لا يمكن الدخول." body={REASON[r] ?? m?.slice(0, 200) ?? 'لا تملك صلاحية الوصول.'}>
      <a className="btn" href="/admin">أعد المحاولة</a>
    </PageHero>
  )
}
