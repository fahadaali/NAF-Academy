/* تهيئة المنصة — بعد أول نشر، ثم كلما احتاجت ترحيلاً: الترحيلات والبذرة وحزمة الهوية والمالك الأول، من المتصفح. */
import type { Metadata } from 'next'
import { setupStatus } from '@/server/setup'
import { OwnerForm, SetupForm } from './SetupForm'
import st from './setup.module.css'
import { envVar } from '@/server/runtime'
import { isSetupLocked } from '@/lib/setup-lock'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'تهيئة المنصة', robots: { index: false, follow: false } }

export default async function Setup() {
  /* مقفلة بعد التهيئة: لا نموذج ولا حالة المنصة — والفتح من متغيرات العامل (يحتاج صلاحية Cloudflare لا كلمة مرور) */
  if (isSetupLocked(envVar('SETUP_LOCKED'))) return (
    <main id="main" className={st.page}>
      <div className={st.card}>
        <h1 className={st.title}>صفحة الإعداد مقفلة</h1>
        <p className={st.lead}>المنصة مهيّأة، والترحيلات بعد كل نشر تُطبَّق تلقائياً كل 5 دقائق.</p>
        <p className={st.lead}>لفتحها (استعادة حساب المالك مثلاً): Cloudflare ← Workers ← naf-academy ← Settings ← Variables، واجعل <bdi dir="ltr">SETUP_LOCKED</bdi> = <bdi dir="ltr">0</bdi>. النشر التالي يعيد القفل من <bdi dir="ltr">wrangler.jsonc</bdi>.</p>
        <p className={st.lead}><a href="/admin/login">إلى لوحة الإدارة ←</a></p>
      </div>
    </main>
  )
  const s = await setupStatus()
  const rows: [string, boolean, string][] = [
    ['ترحيلات القاعدة', !s.migrations.pending.length, s.d1 ? `${s.migrations.applied} من ${s.migrations.total}${s.migrations.pending.length ? ` — معلّق: ${s.migrations.pending.length}` : ''}` : 'محلياً: يطبّقها db-setup'],
    ['المحتوى المبدئي', s.seeded, s.seeded ? 'موجود' : 'لم يُبذر'],
    ['حزمة الهوية', s.brandKit, s.brandKit ? 'مطبّقة' : 'لم تُطبّق'],
    ['المالك', s.ownerReady, s.ownerReady ? 'موجود' : s.owner ? 'بلا كلمة مرور — عيّنها أدناه' : 'لا مالك بعد'],
  ]
  const done = rows.every(([, ok]) => ok)
  return (
    <main id="main" className={st.page}>
      <div className={st.card}>
        <h1 className={st.title}>تهيئة المنصة</h1>
        <p className={st.lead}>{done ? 'المنصة مهيّأة. الترحيلات الجديدة بعد أي نشر تُطبَّق تلقائياً كل 5 دقائق — أو من هنا فوراً.' : 'خطوة واحدة بعد النشر: تُطبَّق ترحيلات القاعدة، ويُبذر المحتوى المبدئي، وتُرفع حزمة الهوية، وتصير مالكاً.'}</p>
        <ul className={st.status} role="list">
          {rows.map(([label, ok, note]) => (
            <li key={label} data-ok={ok ? '1' : '0'}><span aria-hidden="true">{ok ? '✓' : '○'}</span><strong>{label}</strong><small className="num">{note}</small></li>
          ))}
        </ul>
        <SetupForm needOwner={!s.owner} needSeed={!s.seeded} />
        {s.owner && <OwnerForm open={!s.ownerReady} />}
        {s.ownerReady && <p className={st.lead}><a href="/admin/login">إلى لوحة الإدارة ←</a></p>}
      </div>
    </main>
  )
}
