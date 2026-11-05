import type { MetadataRoute } from 'next'

/* تثبيت الأكاديمية تطبيقاً على الجوال والحاسب. الألوان قيم مباشرة لأن البيان لا يقرأ متغيرات CSS (مرآة لرموز الهوية) */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'أكاديمية ناف للتدريب القانوني',
    short_name: 'أكاديمية ناف',
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
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'دوراتي', url: '/learn', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'تصفّح الدورات', url: '/courses', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  }
}
