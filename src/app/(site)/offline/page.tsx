import type { Metadata } from 'next'
import { LogoMark } from '@/components/Logo'
import { brandView } from '@/server/brand'

export const metadata: Metadata = { title: 'دون اتصال', robots: { index: false } }

export default async function Offline() {
  const brand = await brandView()
  return (
    <section className="wrap" style={{ minBlockSize: '70svh', display: 'grid', placeContent: 'center', justifyItems: 'center', gap: 16, textAlign: 'center', paddingBlock: 'calc(var(--header-h) + 40px) 80px' }}>
      <LogoMark pair={brand.academy} alt={brand.name} height={64} />
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(30px, 5vw, 48px)', fontWeight: 900 }}>لا اتصال بالإنترنت</h1>
      <p style={{ color: 'var(--muted)', maxInlineSize: '46ch', lineHeight: 1.9 }}>الصفحات العامة التي زرتها متاحة الآن دون اتصال. الدروس وحسابك تحتاج الاتصال — أعد المحاولة حين يعود.</p>
      <a className="btn" href="/">الرئيسية</a>
    </section>
  )
}
