/* الشعار من اللوحة — نسخة الخلفيات الفاتحة ونسخة الداكنة، ويختار CSS المناسبة للسطح
   (مشهد داكن، شريط فوق مشهد داكن، الوضع الداكن). بلا شعار مرفوع: الرمز الافتراضي. */
import type { BrandView, LogoPair } from '@/lib/brand'
import { Emblem } from './Emblem'

type Tone = 'auto' | 'light' | 'dark'

/** صورة شعار واحد بارتفاع محدد. tone: light = سطح فاتح، dark = سطح داكن، auto = حسب السطح */
export function LogoMark({ pair, alt, height, tone = 'auto', fallback = true, className = '' }: { pair: LogoPair; alt: string; height: number; tone?: Tone; fallback?: boolean; className?: string }) {
  const { light, dark } = pair
  if (!light && !dark) return fallback ? <Emblem size={height} className={className} /> : null
  const one = (img: NonNullable<LogoPair['light']>, cls: string) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={img.url} alt={alt} height={height} width={img.h ? Math.round((img.w / img.h) * height) : undefined} className={`logo-img ${cls} ${className}`} style={{ blockSize: height, inlineSize: 'auto' }} decoding="async" />
  )
  if (tone === 'light') return one(light ?? dark!, '')
  if (tone === 'dark') return one(dark ?? light!, '')
  if (!light || !dark || light.url === dark.url) return one((light ?? dark)!, '')
  return <>{one(light, 'logo-on-light')}{one(dark, 'logo-on-dark')}</>
}

/** شعار الأكاديمية مع اسمها (إن اختير إظهار الاسم أو لم يُرفع شعار) */
export function Wordmark({ brand, className = '', height = 34, tone = 'auto' }: { brand: BrandView; className?: string; height?: number; tone?: Tone }) {
  const logo = brand.academy.light || brand.academy.dark
  const name = brand.showName || !logo
  return (
    <span className={`wordmark ${className}`}>
      <LogoMark pair={brand.academy} alt={name ? '' : brand.name} height={height} tone={tone} />
      {name && (
        <span className="wordmark-text">
          <strong>{brand.name}</strong>
          {brand.tagline && <small>{brand.tagline}</small>}
        </span>
      )}
    </span>
  )
}
