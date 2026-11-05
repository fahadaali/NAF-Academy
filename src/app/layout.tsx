import type { Metadata, Viewport } from 'next'
import { brandView } from '@/server/brand'
import Script from 'next/script'
import './globals.css'
import { SwRegister } from '@/components/SwRegister'
import { siteUrl } from '@/server/site'
import { pagesContent } from '@/server/queries'

/* الرابط المطلق للبيانات الوصفية (الصور والروابط الأساسية) — من SITE_URL */
export async function generateMetadata(): Promise<Metadata> {
  const [b, pages] = await Promise.all([brandView(), pagesContent()])
  /* أيقونة اللوحة وحدها إن رُفعت، وإلا الافتراضية (public/icons والملفان في app/) */
  const icon = b.icon
    ? { icon: [{ url: b.icon.url, type: 'image/png', sizes: `${b.icon.w}x${b.icon.h}` }], apple: [{ url: b.icon.url }] }
    : { icon: [{ url: '/icons/favicon.ico', sizes: '48x48' }, { url: '/icon.svg', type: 'image/svg+xml' }], apple: [{ url: '/apple-icon.png' }] }
  return {
    ...base, metadataBase: new URL(siteUrl() ?? 'http://localhost:3000'),
    title: { default: pages.site.title || `${b.name} — ${b.tagline}`, template: `%s · ${b.name}` },
    description: pages.site.description,
    openGraph: { ...base.openGraph, siteName: b.name },
    appleWebApp: { capable: true, title: b.name, statusBarStyle: 'black-translucent' },
    icons: icon,
  }
}

const base: Metadata = {
  title: { default: 'أكاديمية ناف — للتدريب القانوني', template: '%s · أكاديمية ناف' },
  description: 'أكاديمية متخصصة في التدريب القانوني: مسارات ودورات مباشرة وحضورية ومسجّلة، من الممارسة إلى الخبرة.',
  openGraph: { locale: 'ar_SA', type: 'website', siteName: 'أكاديمية ناف' },
  appleWebApp: { capable: true, title: 'أكاديمية ناف', statusBarStyle: 'black-translucent' },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f2e8' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1520' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <Script src="/boot.js" strategy="beforeInteractive" />
        <link rel="preload" href="/fonts/riyal.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>
        <nav aria-label="تخطّي"><a href="#main" className="skip">تجاوز إلى المحتوى</a></nav>
        {children}
        <SwRegister />
      </body>
    </html>
  )
}
