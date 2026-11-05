import { count, desc, eq, isNull } from 'drizzle-orm'
import { db, schema as s } from '@/server/db'
import { requirePermission } from '@/server/auth'
import { corporateSettings } from '@/server/settings'
import { CORP_STATUS } from '@/server/db/schema'
import { NotifyForm, RequestCard, STATUS } from '@/admin/corporate/Corporate'
import { PageHead, Section } from '@/admin/ui/kit'
import { when } from '@/admin/sales/labels'
import p from '@/admin/ui/panel.module.css'
import c from '@/admin/corporate/corporate.module.css'

export default async function CorporateRequests({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  await requirePermission('corporate.manage')
  const q = (await searchParams).s
  const status = CORP_STATUS.find((x) => x === q)
  const [rows, counts, cfg] = await Promise.all([
    db.select().from(s.corporateRequests).where(status ? eq(s.corporateRequests.status, status) : undefined).orderBy(desc(s.corporateRequests.createdAt)).limit(300),
    db.select({ st: s.corporateRequests.status, n: count() }).from(s.corporateRequests).groupBy(s.corporateRequests.status),
    corporateSettings(),
  ])
  const n = new Map(counts.map((x) => [x.st, x.n]))
  /* حساب المؤسسة المؤرشف (في السلة) لا يُربط إليه — يُعرض «إنشاء حساب» من جديد أو يُسترجع من السلة */
  const liveOrgs = new Set((await db.select({ id: s.organizations.id }).from(s.organizations).where(isNull(s.organizations.deletedAt))).map((o) => o.id))
  return (
    <>
      <PageHead title="طلبات المؤسسات" sub="من نموذج «للمؤسسات» في الرئيسية — تابع كل طلب حتى التعاقد" actions={<a className="btn ghost" href="/admin/organizations">حسابات المؤسسات</a>} />
      <Section title="التبليغ" desc="من يصله بريد عند وصول طلب جديد"><NotifyForm initial={cfg.notify} /></Section>
      <div className={p.toolbar}><div className={p.chips}>
        <a href="?" className={p.chip} aria-current={(!status) ? 'page' : undefined}>الكل <span className="num">{[...n.values()].reduce((a, b) => a + b, 0)}</span></a>
        {CORP_STATUS.map((k) => <a key={k} href={`?s=${k}`} className={p.chip} aria-current={(status === k) ? 'page' : undefined}>{STATUS[k]} <span className="num">{n.get(k) ?? 0}</span></a>)}
      </div></div>
      {rows.length === 0 ? <div className={p.empty}>لا طلبات بعد.</div> : (
        <div className={c.list}>
          {rows.map((r) => <RequestCard key={r.id} r={{ id: r.id, name: r.name, org: r.org, contact: r.contact, size: r.size, interests: r.interests, status: r.status, notes: r.notes, when: when(r.createdAt), orgId: r.organizationId && liveOrgs.has(r.organizationId) ? r.organizationId : null, message: r.message }} />)}
        </div>
      )}
    </>
  )
}
