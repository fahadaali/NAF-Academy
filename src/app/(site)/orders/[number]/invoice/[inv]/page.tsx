import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { orderForBuyer } from '@/server/sales'
import { formatAmount } from '@/lib/pricing'
import { LogoMark } from '@/components/Logo'
import { brandView } from '@/server/brand'
import { PrintButton } from '@/site/PrintButton'
import s from '@/site/invoice.module.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'فاتورة ضريبية', robots: { index: false } }

const dt = (iso: string) => new Date(iso).toLocaleString('ar-SA-u-nu-latn', { timeZone: 'Asia/Riyadh', dateStyle: 'long', timeStyle: 'short' })

export default async function Invoice({ params, searchParams }: { params: Promise<{ number: string; inv: string }>; searchParams: Promise<{ t?: string }> }) {
  const { number, inv } = await params
  const { t = '' } = await searchParams
  const o = await orderForBuyer(number, t)
  const invoice = o?.invoices.find((i) => i.number === inv)
  if (!o || !invoice) notFound()
  /* الرمز بلون النص (currentColor) — يُولَّد بأسود مؤقت ثم يُستبدل، فلا قيمة لون في الصفحة */
  const qr = (await QRCode.toString(invoice.qr, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#00000000' } })).replaceAll('#000000', 'currentColor')
  const credit = invoice.kind === 'credit_note'
  const exVat = invoice.total - invoice.vat
  const brand = await brandView()
  return (
    <div className={s.page}>
      <div className={s.toolbar}><PrintButton /><a href={`/orders/${number}/invoice/${invoice.number}/pdf?t=${t}`} download>تنزيل PDF</a><a href={`/orders/${number}?t=${t}`}>العودة للطلب</a></div>
      <article className={s.sheet}>
        <header className={s.head}>
          <div className={s.brand}>
            <LogoMark pair={brand.academy} alt={brand.name} height={48} tone="light" />
            <div><strong>{brand.name}</strong><span>{invoice.seller.name}</span></div>
          </div>
          <div className={s.kind}>
            <h1>{credit ? 'إشعار دائن' : 'فاتورة ضريبية مبسّطة'}</h1>
            <span>{credit ? 'Credit Note' : 'Simplified Tax Invoice'}</span>
          </div>
        </header>
        <dl className={`num ${s.meta}`}>
          <div><dt>رقم المستند</dt><dd>{invoice.number}</dd></div>
          <div><dt>التاريخ</dt><dd>{dt(invoice.issuedAt)}</dd></div>
          <div><dt>رقم الطلب</dt><dd>{number}</dd></div>
          {invoice.refOf && <div><dt>مرجع الفاتورة</dt><dd>{invoice.refOf}</dd></div>}
        </dl>
        <div className={s.parties}>
          <section><h2>البائع</h2><p>{invoice.seller.name}</p><p className="num">الرقم الضريبي: {invoice.seller.vatNumber || '—'}</p>{invoice.seller.crNumber && <p className="num">السجل التجاري: {invoice.seller.crNumber}</p>}<p>{invoice.seller.address}</p></section>
          <section><h2>المشتري</h2><p>{invoice.buyer.org || invoice.buyer.name}</p>{invoice.buyer.org && <p>{invoice.buyer.name}</p>}<p className={s.email}>{invoice.buyer.email}</p>{invoice.buyer.vatNumber && <p className="num">الرقم الضريبي: {invoice.buyer.vatNumber}</p>}</section>
        </div>
        <table className={`num ${s.lines}`}>
          <thead><tr><th>البيان</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
          <tbody>{invoice.lines.map((l, i) => <tr key={i}><td>{l.title.replace(/~\d?/g, '')}</td><td>{l.quantity}</td><td><bdi dir="ltr">{formatAmount(l.unit)}</bdi></td><td><bdi dir="ltr">{formatAmount(l.total)}</bdi></td></tr>)}</tbody>
        </table>
        <div className={s.foot}>
          <div className={s.qr} dangerouslySetInnerHTML={{ __html: qr }} role="img" aria-label="رمز الفاتورة الضريبية" />
          <dl className={`num ${s.totals}`}>
            <div><dt>الإجمالي غير شامل الضريبة</dt><dd>{formatAmount(exVat)} ر.س</dd></div>
            <div><dt>ضريبة القيمة المضافة {o.order.vatRate}%</dt><dd>{formatAmount(invoice.vat)} ر.س</dd></div>
            <div className={s.grand}><dt>{credit ? 'المبلغ المسترد' : 'الإجمالي شامل الضريبة'}</dt><dd>{formatAmount(invoice.total)} ر.س</dd></div>
          </dl>
        </div>
        <p className={s.note}>صدر هذا المستند إلكترونياً ولا يحتاج إلى توقيع.</p>
      </article>
    </div>
  )
}
