import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'
import { SwRegister } from '@/components/SwRegister'
import { siteUrl } from '@/server/site'

/* الرابط المطلق للبيانات الوصفية (الصور والروابط الأساسية) — من SITE_URL */
export async function generateMetadata(): Promise<Metadata> {
  return { ...base, metadataBase: new URL(siteUrl() ?? 'http://localhost:3000') }
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
