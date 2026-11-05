'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import type { CouponRow } from '@/server/db/schema'
import { setCouponActive, trashCoupon } from './actions'
import { Badge, PageHead, Switch } from '@/admin/ui/kit'
import { sar } from './labels'
import p from '@/admin/ui/panel.module.css'

type Row = CouponRow & { uses: number; discountTotal: number; revenue: number }

const valueText = (c: CouponRow) => (c.kind === 'percent' ? `${c.value}%` : `${sar(c.value)} ر.س`)

export function CouponsTable({ rows }: { rows: Row[] }) {
  const [list, setList] = useState(rows)
  const [q, setQ] = useState('')
  const [showBatch, setShowBatch] = useState(false)
  const [copied, setCopied] = useState('')
  const [, start] = useTransition()
  const shown = list.filter((c) => (showBatch || !c.batch) && (!q || c.code.includes(q.toUpperCase()) || c.label.includes(q)))
  const batches = [...new Set(list.filter((c) => c.batch).map((c) => c.batch))]
  const state = (c: CouponRow) => {
    const now = new Date().toISOString()
    if (!c.active) return { tone: 'draft', text: 'موقوف' }
    if (c.endsAt && c.endsAt < now) return { tone: 'closed', text: 'منتهي' }
    if (c.startsAt && c.startsAt > now) return { tone: 'scheduled', text: 'مجدول' }
    if (c.maxUses !== null && (c as Row).uses >= c.maxUses) return { tone: 'full', text: 'مستنفد' }
    return { tone: 'open', text: 'ساري' }
  }
  return (
    <>
      <PageHead title="الكوبونات" sub={`${list.filter((c) => !c.batch).length} كوبون · ${batches.length} دفعة مؤسسات`} actions={<Link className="btn" href="/admin/coupons/new">+ كوبون جديد</Link>} />
      <div className={p.toolbar}>
        <input className={p.search} placeholder="ابحث بالرمز أو الوصف…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Switch checked={showBatch} onChange={setShowBatch} label="إظهار أكواد الدفعات" />
      </div>
      {shown.length === 0 ? <div className={p.empty}>لا كوبونات بعد — أنشئ أول كوبون أو دفعة أكواد لمؤسسة.</div> : (
        <table className={p.table}>
          <thead><tr><th>الرمز</th><th>الخصم</th><th>الاستخدام</th><th>الإيراد / الخصم</th><th>الحالة</th><th /></tr></thead>
          <tbody>
            {shown.map((c) => {
              const st = state(c)
              return (
                <tr key={c.id}>
                  <td><Link href={`/admin/coupons/${c.id}`} className={p.rowLink} dir="ltr">{c.code}</Link><div className={p.muted}>{c.label || (c.scope === 'all' ? 'كل الدورات' : c.scope === 'courses' ? `${c.courseIds.length} دورات` : `${c.trackIds.length} مسارات`)}{c.emailDomain ? ` · @${c.emailDomain}` : ''}</div></td>
                  <td className="num">{valueText(c)}</td>
                  <td className="num">{c.uses}{c.maxUses !== null ? ` / ${c.maxUses}` : ''}</td>
                  <td className="num">{sar(c.revenue)} <span className={p.muted}>/ {sar(c.discountTotal)}</span></td>
                  <td><Badge tone={st.tone}>{st.text}</Badge></td>
                  <td>
                    <div className={p.cellRow} style={{ gap: 2, justifyContent: 'end' }}>
                      <button className={p.iconBtn} onClick={() => { navigator.clipboard?.writeText(`${location.origin}/courses?coupon=${c.code}`); setCopied(c.id) }}>{copied === c.id ? 'نُسخ ✓' : 'نسخ الرابط'}</button>
                      <button className={p.iconBtn} onClick={() => { setList((l) => l.map((x) => (x.id === c.id ? { ...x, active: !x.active } : x))); start(() => setCouponActive(c.id, !c.active)) }}>{c.active ? 'إيقاف' : 'تفعيل'}</button>
                      <button className={`${p.iconBtn} ${p.danger}`} onClick={() => { if (confirm(`حذف ${c.code}؟ يبقى أثره في الطلبات السابقة.`)) { setList((l) => l.filter((x) => x.id !== c.id)); start(() => trashCoupon(c.id)) } }}>حذف</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </>
  )
}
