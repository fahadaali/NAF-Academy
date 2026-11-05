/* عامل الخدمة — تصفّح الصفحات العامة دون اتصال، وإشعارات المتصفح.
   لا يُخزَّن أي محتوى خاص (حسابي، الدروس، اللوحة، الطلبات، الملفات) — يُطلب من الشبكة دائماً. */
const VERSION = 'naf-v1'
const STATIC = `${VERSION}-static`
const PAGES = `${VERSION}-pages`
const OFFLINE = '/offline'

const PRIVATE = /^\/(admin|api|auth|learn|learn-go|files|orders|unsubscribe|login|certificates\/[^/]+\/(pdf|badge))(\/|$)/
const PUBLIC_PAGE = /^\/($|courses(\/[a-z0-9-]+)?$|tracks(\/[a-z0-9-]+)?$|instructors(\/[a-z0-9-]+)?$|certificates\/verify$)/

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll([OFFLINE, '/icons/icon-192.png'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin) return
  const path = url.pathname

  /* الملفات المجزّأة والخطوط والصور: من الذاكرة أولاً */
  if (path.startsWith('/_next/static/') || path.startsWith('/fonts/') || path.startsWith('/media/') || path.startsWith('/icons/')) {
    e.respondWith(caches.open(STATIC).then(async (c) => {
      const hit = await c.match(req)
      if (hit) return hit
      const res = await fetch(req)
      if (res.ok) c.put(req, res.clone())
      return res
    }))
    return
  }

  if (req.mode !== 'navigate') return

  /* الصفحات الخاصة: من الشبكة فقط، وصفحة «دون اتصال» عند الانقطاع */
  if (PRIVATE.test(path)) {
    e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)))
    return
  }

  /* الصفحات العامة: الشبكة أولاً، وتُحفظ نسخة للتصفح دون اتصال */
  e.respondWith(fetch(req).then((res) => {
    if (res.ok && PUBLIC_PAGE.test(path) && !url.search) caches.open(PAGES).then((c) => c.put(req, res.clone()))
    return res
  }).catch(async () => (await caches.match(req, { ignoreSearch: true })) ?? caches.match(OFFLINE)))
})

/* ───────── الإشعارات ───────── */
self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { title: 'أكاديمية ناف', body: e.data ? e.data.text() : '' } }
  e.waitUntil(self.registration.showNotification(d.title || 'أكاديمية ناف', {
    body: d.body || '', dir: 'rtl', lang: 'ar', icon: '/icons/icon-192.png', badge: '/icons/badge-96.png',
    tag: d.tag || undefined, data: { url: d.url || '/learn' },
  }))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = new URL(e.notification.data?.url || '/learn', location.origin)
  if (url.origin !== location.origin) return
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => new URL(c.url).origin === location.origin)
    if (open) { open.focus(); return open.navigate(url.href) }
    return self.clients.openWindow(url.href)
  }))
})
