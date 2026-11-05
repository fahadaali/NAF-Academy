import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    /* رفع الصور عبر إجراءات الخادم — الحد في التطبيق 8 ميغابايت */
    serverActions: { bodySizeLimit: '10mb' },
  },
}

export default nextConfig
