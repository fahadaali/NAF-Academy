/* الشعار المتحرك لمواضع الحركة (الستار الافتتاحي، التذييل عند تكشّفه): ملف SVG المرفوع يُدرج داخل الصفحة
   بعد تنقيته فتتتابع عناصره (--n) صعوداً وظهوراً — الهندسة والألوان كما في الملف حرفياً، الحركة على transform/opacity فقط.
   ملف PNG يُكشف بستارة clip-path، وبلا شعار مرفوع يتكشّف رمز الكتاب. تحت تقليل الحركة يظهر كاملاً ثابتاً.
   مكوّن خادم (يقرأ الملف من التخزين) — المواضع الثابتة تستعمل LogoMark. */
import type { BrandView, LogoImg, LogoPair } from '@/lib/brand'
import { logoSvg } from '@/server/brand'
import { Emblem } from './Emblem'

type Tone = 'auto' | 'light' | 'dark'

async function one(img: LogoImg, alt: string, height: number, cls: string) {
  const a11y = alt ? { role: 'img', 'aria-label': alt } : { 'aria-hidden': true as const }
  const svg = img.svg ? await logoSvg(img.key) : null
  if (svg) {
    const ratio = img.h ? img.w / img.h : undefined
    return <span className={`logo-live logo-motion ${cls}`} style={{ blockSize: height, aspectRatio: ratio }} {...a11y} dangerouslySetInnerHTML={{ __html: svg }} />
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={img.url} alt={alt} height={height} width={img.h ? Math.round((img.w / img.h) * height) : undefined} className={`logo-img logo-motion ${cls}`} style={{ blockSize: height, inlineSize: 'auto' }} decoding="async" />
  )
}

/** شعار متحرك واحد. tone كما في LogoMark */
export async function LiveLogo({ pair, alt, height, tone = 'auto', className = '' }: { pair: LogoPair; alt: string; height: number; tone?: Tone; className?: string }) {
  const { light, dark } = pair
  if (!light && !dark) return <Emblem size={height} draw className={className} />
  if (tone === 'light') return one(light ?? dark!, alt, height, className)
  if (tone === 'dark') return one(dark ?? light!, alt, height, className)
  if (!light || !dark || light.url === dark.url) return one((light ?? dark)!, alt, height, className)
  return <>{await one(light, alt, height, `logo-on-light ${className}`)}{await one(dark, alt, height, `logo-on-dark ${className}`)}</>
}

/** صيغة الشريط متحركةً مع الاسم (إن اختير إظهاره أو لم يُرفع شعار) — مرآة Wordmark */
export async function LiveWordmark({ brand, className = '', height = 34, tone = 'auto' }: { brand: BrandView; className?: string; height?: number; tone?: Tone }) {
  const logo = brand.academy.light || brand.academy.dark
  const name = brand.showName || !logo
  return (
    <span className={`wordmark ${className}`}>
      <LiveLogo pair={brand.academy} alt={name ? '' : brand.name} height={height} tone={tone} />
      {name && (
        <span className="wordmark-text">
          <strong>{brand.name}</strong>
          {brand.tagline && <small>{brand.tagline}</small>}
        </span>
      )}
    </span>
  )
}
