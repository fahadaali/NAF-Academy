/* تصنيف المسار لعدّاد الزيارات — دالة نقية مختبرة. لا يُعدّ إلا الصفحات العامة. */
export type Hit = { metric: string; key: string }

export function classify(path: string): Hit[] {
  const p = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/'
  if (!p.startsWith('/') || p.length > 200 || /^\/(admin|api|auth|learn|_next|files|orders|unsubscribe)(\/|$)/.test(p)) return []
  const out: Hit[] = [{ metric: 'view', key: '*' }]
  let m: RegExpMatchArray | null
  if ((m = p.match(/^\/courses\/([a-z0-9-]{1,80})\/enroll$/))) out.push({ metric: 'checkout', key: m[1] })
  else if ((m = p.match(/^\/courses\/([a-z0-9-]{1,80})$/))) out.push({ metric: 'course', key: m[1] })
  else if (p === '/' ) out.push({ metric: 'page', key: 'home' })
  else if ((m = p.match(/^\/(courses|tracks|instructors|certificates)(\/|$)/))) out.push({ metric: 'page', key: m[1] })
  return out
}

export const isBot = (ua: string) => !ua || /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python|axios/i.test(ua)
