import 'server-only'
/* رابط الموقع المطلق — للبريد والرسائل التي تُرسل خارج أي طلب (الجدولة الدورية).
   في الإنتاج يجب ضبط SITE_URL، وإلا تتوقف الرسائل الآلية بدل أن تخرج بروابط مكسورة. */
import { envVar } from './runtime'

export function siteUrl(): string | null {
  const v = (envVar('SITE_URL') ?? '').trim().replace(/\/+$/, '')
  if (/^https:\/\/[^\s/]+/.test(v)) return v
  if (process.env.NODE_ENV !== 'production') return v && /^http:\/\/localhost(:\d+)?$/.test(v) ? v : `http://localhost:${process.env.PORT ?? 3000}`
  return null
}
