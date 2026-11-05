/* صورة بنقطة تركيز: تُقصّ على أي نسبة دون أن يضيع موضوعها. */
import type { MediaView } from '@/content/types'

type Props = { media: MediaView; className?: string; sizes?: string; priority?: boolean }

export function Picture({ media, className = '', priority }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={media.url}
      alt={media.alt}
      width={media.w || undefined}
      height={media.h || undefined}
      className={className}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      style={{ objectFit: 'cover', objectPosition: `${media.x}% ${media.y}%`, inlineSize: '100%', blockSize: '100%' }}
    />
  )
}
