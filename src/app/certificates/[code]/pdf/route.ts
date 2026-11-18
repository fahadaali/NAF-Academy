/* ملف الشهادة — الملغاة لا تُنزَّل. الملف يحمل رقم الهوية كاملاً فلا يُعطى إلا لصاحب الشهادة أو للفريق؛
   والتحقق العام بالرمز من صفحة الشهادة (الرقم فيها مقنّع). الشهادات القديمة بلا رقم هوية عامة لمن يملك الرمز كما كانت. */
import { NextResponse } from 'next/server'
import { absoluteVerifyUrl, certificateByCode, certificatePdfBytes, mayDownloadCertificate } from '@/server/certificates'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const r = await certificateByCode((await ctx.params).code)
  if (!r || !r.c.code) return new Response('Not found', { status: 404 })
  if (r.c.status !== 'issued') return new Response('Revoked', { status: 410 })
  if (!(await mayDownloadCertificate(r.c))) {
    const back = `/certificates/${r.c.code}/pdf${new URL(req.url).search}`
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(back)}`, req.url), 303)
  }
  /* المخزّن يُنزَّل دائماً؛ والتوليد بلا SITE_URL يُرفض (لا رابط تحقق نسبي) — ردّ واضح بدل خطأ خادم */
  const bytes = await certificatePdfBytes(r.c).catch((e) => { console.error('certificate pdf', e); return null })
  if (!bytes) return new Response(absoluteVerifyUrl(r.c.code) ? 'تعذّر توليد الشهادة — حاول لاحقاً' : 'الشهادة غير متاحة للتنزيل مؤقتاً — عنوان الموقع غير مضبوط', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '600' } })
  const dl = new URL(req.url).searchParams.has('download')
  return new Response(bytes as BodyInit, {
    headers: {
      'content-type': 'application/pdf', 'cache-control': 'private, max-age=600', 'x-content-type-options': 'nosniff',
      'content-disposition': `${dl ? 'attachment' : 'inline'}; filename="${r.c.code}.pdf"; filename*=UTF-8''${encodeURIComponent(`شهادة ${r.c.courseTitle}.pdf`)}`,
    },
  })
}
