/* مفتاح العنوان لحدود المحاولات: IPv4 كما هو، وIPv6 بشبكته /64 — المشترك الواحد يُعطى عادة شبكة /64 كاملة
   (2^64 عنواناً)، فالحدّ على العنوان الكامل يُتجاوز بتبديل العنوان داخلها. */
export function ipBucket(raw: string): string {
  const ip = raw.trim().toLowerCase()
  if (!ip.includes(':')) return ip
  /* IPv4 مضمّن (::ffff:1.2.3.4) يُعامل كـ IPv4 */
  const v4 = ip.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (v4 && /^(::ffff:|0:0:0:0:0:ffff:)/.test(ip)) return v4[1]
  const [head, tail = ''] = ip.split('::')
  const h = head ? head.split(':') : []
  const t = ip.includes('::') ? (tail ? tail.split(':') : []) : []
  const groups = ip.includes('::') ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h
  return `${groups.slice(0, 4).map((g) => (g || '0').replace(/^0+(?=.)/, '')).join(':')}::/64`
}
