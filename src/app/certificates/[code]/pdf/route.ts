/* ملف الشهادة — عام لمن يملك الرمز (الرمز عشوائي ويُشارك عمداً). الملغاة لا تُنزَّل. */
import { certificateByCode, certificatePdfBytes } from '@/server/certificates'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const r = await certificateByCode((await ctx.params).code)
  if (!r || !r.c.code) return new Response('Not found', { status: 404 })
  if (r.c.status !== 'issued') return new Response('Revoked', { status: 410 })
  const bytes = await certificatePdfBytes(r.c)
  const dl = new URL(req.url).searchParams.has('download')
  return new Response(bytes as BodyInit, {
    headers: {
      'content-type': 'application/pdf', 'cache-control': 'private, max-age=600', 'x-content-type-options': 'nosniff',
      'content-disposition': `${dl ? 'attachment' : 'inline'}; filename="${r.c.code}.pdf"; filename*=UTF-8''${encodeURIComponent(`شهادة ${r.c.courseTitle}.pdf`)}`,
    },
  })
}
