/* عرض الشهادة في الصفحة — نفس المواضع والمقاسات النسبية لملف PDF (الصفحة 842×595 نقطة).
   المقاسات بوحدة cqw فيتناسب العرض مع أي عرض حاوية. */
import { BLOCKS, PAGE, TONES, type BlockKey, type CertDesign } from '@/lib/certificate'
import { parse, render } from '@/motion/kashida'
import { Emblem } from './Emblem'
import { LogoMark } from './Logo'
import { hasLogo, type BrandView } from '@/lib/brand'
import c from './certificate.module.css'

export type CertViewData = { name: string; course: string; hours: number; date: string; hijri: string; code: string; qrSvg?: string }

const cq = (pt: number) => `${(pt / PAGE.w) * 100}cqw`

export function CertificateView({ design, data, brand, onPick, active, dragRef, images = {} }: {
  design: CertDesign; data: CertViewData; brand: BrandView
  /** روابط الصور بمعرّفاتها (الخلفية والتوقيعات) — كما يرسمها ملف PDF */
  images?: Record<string, string>
  /** للمحرّر: بدء سحب عنصر */
  onPick?: (k: BlockKey, e: React.PointerEvent) => void
  active?: BlockKey | null
  dragRef?: React.Ref<HTMLDivElement>
}) {
  const T = TONES[design.tone]
  const tone = design.tone === 'night' ? 'dark' : 'light'
  const B = design.blocks
  const vars = { '--c-bg': T.bg, '--c-ink': T.ink, '--c-soft': T.soft, '--c-gold': T.gold, '--c-line': T.line, '--c-plate': TONES.ivory.bg, '--c-plate-ink': TONES.ivory.ink } as React.CSSProperties
  const at = (k: BlockKey, children: React.ReactNode) => B[k].show && (
    <div key={k} className={c.block} data-active={active === k ? '1' : '0'} data-edit={onPick ? '1' : '0'} style={{ left: `${B[k].x}%`, top: `${B[k].y}%` }}
      onPointerDown={onPick ? (e) => onPick(k, e) : undefined}>{children}</div>
  )
  const nodes: Record<BlockKey, React.ReactNode> = {
    /* الشعاران متجاوران بالارتفاع نفسه: الأكاديمية ثم شركة ناف — من اللوحة */
    brand: at('brand', hasLogo(brand.academy) || hasLogo(brand.naf) ? (
      <div className={c.logos} style={{ fontSize: cq(B.brand.size) }}>
        <div className={c.pair}>
          <LogoMark pair={brand.academy} alt={brand.name} height={0} tone={tone} className={c.logo} />
          {hasLogo(brand.naf) && <><i aria-hidden="true" /><LogoMark pair={brand.naf} alt={brand.companyName} height={0} tone={tone} fallback={false} className={c.logo} /></>}
        </div>
        {brand.showName && <span className={c.brandName}>{brand.name}{brand.tagline && <small>{brand.tagline}</small>}</span>}
      </div>
    ) : (
      <div className={c.brand} style={{ fontSize: cq(B.brand.size) }}><Emblem size={0} className={c.emblem} /><strong>{brand.name}</strong><small>{brand.tagline}</small></div>
    )),
    title: at('title', <div className={c.title} style={{ fontSize: cq(B.title.size) }}>{render(parse(design.title), 1)}{design.english && <small>CERTIFICATE OF COMPLETION</small>}</div>),
    lead: at('lead', <div className={c.soft} style={{ fontSize: cq(B.lead.size) }}>{design.lead}</div>),
    name: at('name', <div className={c.name} style={{ fontSize: cq(B.name.size) }}>{data.name}</div>),
    course: at('course', <div className={c.course} style={{ fontSize: cq(B.course.size) }}><span>{design.courseLead}</span><strong>{data.course}</strong></div>),
    hours: at('hours', data.hours > 0 && <div className={c.soft} style={{ fontSize: cq(B.hours.size) }}>{design.hoursText.replace(/\{\{\s*hours\s*\}\}/g, String(data.hours))}</div>),
    date: at('date', <div className={c.date} style={{ fontSize: cq(B.date.size) }}><span>صدرت في {data.date}</span><small>الموافق {data.hijri}</small></div>),
    signatures: at('signatures', <div className={c.signs} style={{ fontSize: cq(B.signatures.size) }}>{design.signatories.map((s, i) => (
      // eslint-disable-next-line @next/next/no-img-element
      <div key={i}>{s.signatureId && images[s.signatureId] ? <img className={c.sig} src={images[s.signatureId]} alt="" /> : <span className={c.sigGap} />}<i /><strong>{s.name}</strong><small>{s.title}</small></div>
    ))}</div>),
    qr: at('qr', <div className={c.qr} style={{ inlineSize: cq(B.qr.size) }}>
      {data.qrSvg ? <span className={c.qrBox} dangerouslySetInnerHTML={{ __html: data.qrSvg }} /> : <span className={c.qrBox} data-ph="1" />}
      <small dir="ltr">{data.code}</small></div>),
  }
  return (
    <div className={c.page} style={vars} ref={dragRef} role="img" aria-label={`شهادة إتمام ${data.course} — ${data.name}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {design.backgroundId && images[design.backgroundId] && <img className={c.bg} src={images[design.backgroundId]} alt="" />}
      <div className={c.frame} />
      {BLOCKS.map((k) => nodes[k])}
    </div>
  )
}
