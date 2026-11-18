/* عرض الشهادة في الصفحة — نفس المواضع والمقاسات النسبية لملف PDF (الصفحة 842×595 نقطة).
   المقاسات بوحدة cqw فيتناسب العرض مع أي عرض حاوية. */
import { BLOCKS, hoursOf, mergeDesign, PAGE, signerEn, SPLIT, splitDateAr, splitDateEn, TONES, type BlockKey, type CertDesign } from '@/lib/certificate'
import { parse, render } from '@/motion/kashida'
import { Emblem } from './Emblem'
import { LogoMark } from './Logo'
import { hasLogo, large, type BrandView } from '@/lib/brand'
import c from './certificate.module.css'

export type CertViewData = { name: string; course: string; hours: number; date: string; hijri: string; code: string; qrSvg?: string; nameEn?: string; courseEn?: string; dateEn?: string; idNumber?: string; dayAr?: string; dayEn?: string }

const cq = (pt: number) => `${(pt / PAGE.w) * 100}cqw`

export function CertificateView({ design: input, data, brand, onPick, active, dragRef, images = {} }: {
  design: CertDesign; data: CertViewData; brand: BrandView
  /** روابط الصور بمعرّفاتها (الخلفية والتوقيعات) — كما يرسمها ملف PDF */
  images?: Record<string, string>
  /** للمحرّر: بدء سحب عنصر */
  onPick?: (k: BlockKey, e: React.PointerEvent) => void
  active?: BlockKey | null
  dragRef?: React.Ref<HTMLDivElement>
}) {
  /* اللقطات القديمة تُكمَّل بالعناصر الأحدث بمواضعها الافتراضية — كما في ملف PDF */
  const design = mergeDesign(input)
  const split = design.layout === 'split'
  const T = TONES[design.tone]
  const tone = design.tone === 'night' ? 'dark' : 'light'
  const B = design.blocks
  const bi = !!design.bilingual
  const en = design.en
  const vars = { '--c-bg': T.bg, '--c-ink': T.ink, '--c-soft': T.soft, '--c-gold': T.gold, '--c-line': T.line, '--c-plate': TONES.ivory.bg, '--c-plate-ink': TONES.ivory.ink } as React.CSSProperties
  const at = (k: BlockKey, children: React.ReactNode, x = B[k].x, side?: 'ar' | 'en') => B[k].show && (
    <div key={side ? `${k}-${side}` : k} className={`${c.block}${side ? ` ${c.col}` : ''}`} data-active={active === k ? '1' : '0'} data-edit={onPick ? '1' : '0'} style={{ left: `${x}%`, top: `${B[k].y}%` }}
      lang={side === 'en' ? 'en' : undefined} dir={side === 'en' ? 'ltr' : undefined}
      onPointerDown={onPick ? (e) => onPick(k, e) : undefined}>{children}</div>
  )
  /* التخطيط المنقسم: كل عنصر نصي عمودان متقابلان على الارتفاع نفسه — العربي يميناً والإنجليزي يساراً */
  const pair = (k: BlockKey, ar: React.ReactNode, enNode: React.ReactNode) => B[k].show && [at(k, ar, SPLIT.ar, 'ar'), at(k, enNode, SPLIT.en, 'en')]
  const idAr = data.idNumber ? <div className={`${c.idno} num`} style={{ fontSize: cq(B.idNumber.size) }}>{design.idLabel} <span dir="ltr">{data.idNumber}</span></div> : null
  const idEn = data.idNumber ? <div className={`${c.idno} num`} style={{ fontSize: cq(B.idNumber.size) }}>{en.idLabel} {data.idNumber}</div> : null
  const splitNodes: Partial<Record<BlockKey, React.ReactNode>> = split ? {
    title: pair('title', <div className={c.title} style={{ fontSize: cq(B.title.size) }}>{render(parse(design.title), 1)}</div>,
      <div className={c.title} style={{ fontSize: cq(B.title.size * 0.72) }}>{en.title}</div>),
    lead: pair('lead', <div className={c.soft} style={{ fontSize: cq(B.lead.size) }}>{design.lead}</div>,
      <div className={c.soft} style={{ fontSize: cq(B.lead.size * 0.92) }}>{en.lead}</div>),
    name: pair('name', <span className={c.name} style={{ fontSize: cq(B.name.size) }}>{data.name}</span>,
      <span className={c.name} style={{ fontSize: cq(B.name.size * (data.nameEn ? 0.8 : 1)) }}>{data.nameEn || data.name}</span>),
    idNumber: data.idNumber ? pair('idNumber', idAr, idEn) : null,
    course: pair('course', <div className={c.course} style={{ fontSize: cq(B.course.size) }}><span>{design.courseLead}</span><strong>{data.course}</strong></div>,
      <div className={c.course} style={{ fontSize: cq(B.course.size) }}><span>{en.courseLead}</span><strong style={{ fontSize: data.courseEn ? '0.85em' : undefined }}>{data.courseEn || data.course}</strong></div>),
    hours: data.hours > 0 ? pair('hours', <div className={c.soft} style={{ fontSize: cq(B.hours.size) }}>{hoursOf(design.hoursText, data.hours)}</div>,
      <div className={c.soft} style={{ fontSize: cq(B.hours.size) }}>{hoursOf(en.hoursText, data.hours)}</div>) : null,
    date: pair('date', <div className={c.date} style={{ fontSize: cq(B.date.size) }}><span>{splitDateAr(data)}</span></div>,
      data.dateEn ? <div className={c.date} style={{ fontSize: cq(B.date.size) }}><span>{splitDateEn(data, en.issued)}</span></div> : null),
  } : {}
  const nodes: Record<BlockKey, React.ReactNode> = {
    /* شعار الأكاديمية وحده — الكامل إن رُفع، وإلا صيغة الشريط — كما في ملف PDF */
    brand: at('brand', hasLogo(large(brand)) ? (
      <div className={c.logos} style={{ fontSize: cq(B.brand.size) }}>
        <div className={c.pair} data-full={hasLogo(brand.lockup) ? '1' : '0'}>
          <LogoMark pair={large(brand)} alt={brand.name} height={0} tone={tone} className={c.logo} />
        </div>
        {brand.showName && <span className={c.brandName}>{brand.name}{brand.tagline && <small>{brand.tagline}</small>}</span>}
      </div>
    ) : (
      <div className={c.brand} style={{ fontSize: cq(B.brand.size) }}><Emblem size={0} className={c.emblem} /><strong>{brand.name}</strong><small>{brand.tagline}</small></div>
    )),
    title: at('title', <div className={c.title} style={{ fontSize: cq(B.title.size) }}>{render(parse(design.title), 1)}{bi && en.title ? <small className={c.enBig} lang="en" dir="ltr">{en.title}</small> : design.english && <small>CERTIFICATE OF COMPLETION</small>}</div>),
    lead: at('lead', <div className={`${c.soft} ${c.stack}`} style={{ fontSize: cq(B.lead.size) }}>{design.lead}{bi && en.lead && <small lang="en" dir="ltr">{en.lead}</small>}</div>),
    name: at('name', <div className={c.stack} style={{ fontSize: cq(B.name.size) }}><span className={c.name}>{data.name}</span>{bi && data.nameEn && <small className={c.enName} lang="en" dir="ltr">{data.nameEn}</small>}</div>),
    idNumber: at('idNumber', data.idNumber && <div className={`${c.stack} num`} style={{ fontSize: cq(B.idNumber.size) }}><span className={c.idno}>{design.idLabel} <span dir="ltr">{data.idNumber}</span></span>{bi && en.idLabel && <small lang="en" dir="ltr">{en.idLabel} {data.idNumber}</small>}</div>),
    course: at('course', <div className={c.course} style={{ fontSize: cq(B.course.size) }}><span>{design.courseLead}</span><strong>{data.course}</strong>{bi && (en.courseLead || data.courseEn) && <small lang="en" dir="ltr">{[en.courseLead, data.courseEn].filter(Boolean).join(' ')}</small>}</div>),
    hours: at('hours', data.hours > 0 && <div className={`${c.soft} ${c.stack}`} style={{ fontSize: cq(B.hours.size) }}>{hoursOf(design.hoursText, data.hours)}{bi && en.hoursText && <small lang="en" dir="ltr">{hoursOf(en.hoursText, data.hours)}</small>}</div>),
    date: at('date', <div className={c.date} style={{ fontSize: cq(B.date.size) }}><span>صدرت في {data.date}</span>{data.hijri && <small>الموافق {data.hijri}</small>}{bi && data.dateEn && <small lang="en" dir="ltr">{en.issued} {data.dateEn}</small>}</div>),
    signatures: at('signatures', <div className={c.signs} style={{ fontSize: cq(B.signatures.size) }}>{design.signatories.map((s, i) => (
      // eslint-disable-next-line @next/next/no-img-element
      <div key={i}>{s.signatureId && images[s.signatureId] ? <img className={c.sig} src={images[s.signatureId]} alt="" /> : <span className={c.sigGap} />}<i /><strong>{s.name}</strong><small>{s.title}</small>{bi && signerEn(s) && <small lang="en" dir="ltr">{signerEn(s)}</small>}</div>
    ))}</div>),
    /* الختم مقابل رمز التحقق — بلا صورة يظهر موضعه في المحرّر وحده */
    stamp: at('stamp', design.stampId && images[design.stampId]
      // eslint-disable-next-line @next/next/no-img-element
      ? <img className={c.stamp} src={images[design.stampId]} alt="" style={{ blockSize: cq(B.stamp.size), rotate: `${design.stampRotate}deg` }} />
      : onPick ? <span className={c.stampPh} style={{ blockSize: cq(B.stamp.size), inlineSize: cq(B.stamp.size) }}>الختم</span> : null),
    qr: at('qr', <div className={c.qr} style={{ inlineSize: cq(B.qr.size) }}>
      {data.qrSvg ? <span className={c.qrBox} dangerouslySetInnerHTML={{ __html: data.qrSvg }} /> : <span className={c.qrBox} data-ph="1" />}
      <small dir="ltr">{data.code}</small></div>),
  }
  return (
    <div className={c.page} style={vars} ref={dragRef} role="img" aria-label={`شهادة إتمام ${data.course} — ${data.name}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {design.backgroundId && images[design.backgroundId] && <img className={c.bg} src={images[design.backgroundId]} alt="" />}
      <div className={c.frame} />
      {split && <div className={c.divider} style={{ top: `${SPLIT.divider.from}%`, bottom: `${100 - SPLIT.divider.to}%` }} aria-hidden="true"><i /></div>}
      {BLOCKS.map((k) => (split && k in splitNodes ? splitNodes[k] : nodes[k]))}
    </div>
  )
}
