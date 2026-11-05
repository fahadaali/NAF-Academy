import type { MetadataRoute } from 'next'
import { brandView } from '@/server/brand'

/* تثبيت الأكاديمية تطبيقاً على الجوال والحاسب. الألوان قيم مباشرة لأن البيان لا يقرأ متغيرات CSS (مرآة لرموز الهوية) */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const b = await brandView()
  /* الأيقونة المرفوعة من اللوحة، وإلا الافتراضية */
  const own = b.icon ? [{ src: b.icon.url, sizes: `${b.icon.w}x${b.icon.h}`, type: 'image/png', purpose: 'any' as const }, { src: b.icon.url, sizes: `${b.icon.w}x${b.icon.h}`, type: 'image/png', purpose: 'maskable' as const }] : null
  return {
    name: `${b.name} ${b.tagline}`.trim(),
    short_name: b.name,
    description: 'دورات قانونية تطبيقية — مسجّلة ومباشرة وحضورية.',
    lang: 'ar',
    dir: 'rtl',
    start_url: '/learn?source=app',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0b1520',
    theme_color: '#0b1520',
    categories: ['education'],
    icons: own ?? [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'دوراتي', url: '/learn', icons: [{ src: b.icon?.url ?? '/icons/icon-192.png', sizes: b.icon ? `${b.icon.w}x${b.icon.h}` : '192x192' }] },
      { name: 'تصفّح الدورات', url: '/courses', icons: [{ src: b.icon?.url ?? '/icons/icon-192.png', sizes: b.icon ? `${b.icon.w}x${b.icon.h}` : '192x192' }] },
    ],
  }
}
