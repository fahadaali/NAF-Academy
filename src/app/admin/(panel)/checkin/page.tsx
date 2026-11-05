import { requirePermission } from '@/server/auth'
import { Scanner } from '@/admin/learning/Scanner'
import { PageHead } from '@/admin/ui/kit'

export default async function CheckinPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  await requirePermission('attendance.mark')
  const t = (await searchParams).t ?? ''
  return (
    <>
      <PageHead title="تسجيل الحضور" sub="امسح تذكرة المتدرب عند الباب" actions={<a className="btn ghost" href="/admin/learning/sessions">الجلسات</a>} />
      <Scanner initial={t.slice(0, 400)} />
    </>
  )
}
