/* تهيئة المنصة — بعد أول نشر، ثم كلما احتاجت ترحيلاً: الترحيلات والبذرة وحزمة الهوية والمالك الأول، من المتصفح. */
import type { Metadata } from 'next'
import { setupStatus } from '@/server/setup'
import { OwnerForm, SetupForm } from './SetupForm'
import st from './setup.module.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'تهيئة المنصة', robots: { index: false, follow: false } }

export default async function Setup() {
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
