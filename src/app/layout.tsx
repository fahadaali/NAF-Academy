import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'أكاديمية ناف — للتدريب القانوني', template: '%s · أكاديمية ناف' },
  description: 'أكاديمية متخصصة في التدريب القانوني: مسارات ودورات مباشرة وحضورية ومسجّلة، من الممارسة إلى الخبرة.',
  openGraph: { locale: 'ar_SA', type: 'website', siteName: 'أكاديمية ناف' },
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
        <a href="#main" className="skip">تجاوز إلى المحتوى</a>
        {children}
      </body>
    </html>
  )
}
