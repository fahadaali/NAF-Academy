import type { NextConfig } from 'next'

/* ترويسات الأمان لكل الاستجابات. الكاميرا للمسح عند الباب، والدفع لـ Apple Pay عبر ميسر. */
const security = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(self), interest-cohort=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    /* رفع الصور عبر إجراءات الخادم — الحد في التطبيق 8 ميغابايت */
    serverActions: { bodySizeLimit: '10mb' },
  },
  /* المتصفحات تطلب /favicon.ico مباشرة — يُحوَّل لأيقونة اللوحة إن وُجدت عبر المسار، وإلا الافتراضية */
  async rewrites() {
    return [{ source: '/favicon.ico', destination: '/api/favicon' }]
  },
  async headers() {
    return [
      { source: '/:path*', headers: security },
      { source: '/admin/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }, { key: 'Cache-Control', value: 'private, no-store' }] },
      { source: '/learn/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }] },
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Service-Worker-Allowed', value: '/' }] },
    ]
  },
}

export default nextConfig
