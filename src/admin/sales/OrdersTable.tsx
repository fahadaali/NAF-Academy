'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { OrderItemRow, OrderRow } from '@/server/db/schema'
import { Badge, PageHead } from '@/admin/ui/kit'
import { METHOD_LABEL, ORDER_LABEL, ORDER_TONE, sar, when } from './labels'
import p from '@/admin/ui/panel.module.css'

type Row = Omit<OrderRow, 'status'> & { status: OrderRow['status'] | 'expired'; items: OrderItemRow[] }

export function OrdersTable({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState('')
  const [st, setSt] = useState('all')
  const shown = useMemo(() => rows.filter((o) => (st === 'all' || o.status === st) &&
    (!q || o.number.includes(q.toUpperCase()) || o.buyer.email.includes(q.toLowerCase()) || o.buyer.name.includes(q) || o.couponCode.includes(q.toUpperCase()))), [rows, q, st])
  const counts = Object.keys(ORDER_LABEL).map((k) => [k, rows.filter((r) => r.status === k).length] as const).filter(([, n]) => n)

  const csv = () => {
    const head = ['الرقم', 'التاريخ', 'الحالة', 'الوسيلة', 'الاسم', 'البريد', 'الجوال', 'الجهة', 'الدورة', 'المقاعد', 'المجموع', 'خصم المجموعة', 'الكوبون', 'خصم الكوبون', 'الإجمالي', 'الضريبة', 'المسترد']
    const lines = shown.map((o) => [o.number, o.createdAt, ORDER_LABEL[o.status], METHOD_LABEL[o.method], o.buyer.name, o.buyer.email, o.buyer.phone, o.buyer.org,
      o.items.map((i) => i.title.replace(/~\d?/g, '')).join(' + '), o.items.reduce((a, i) => a + i.quantity, 0), sar(o.subtotal), sar(o.groupDiscount), o.couponCode, sar(o.couponDiscount), sar(o.total), sar(o.vat), sar(o.refunded)])
    const text = '﻿' + [head, ...lines].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  return (
    <>
      <PageHead title="الطلبات" sub={`${rows.length} طلب`} actions={<><button className="btn ghost" onClick={csv}>تصدير CSV</button><Link className="btn" href="/admin/orders/new">+ طلب يدوي</Link></>} />
      <div className={p.toolbar}>
        <input className={p.search} placeholder="رقم الطلب، البريد، الاسم، الكوبون…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className={p.chips}>
          <button className={p.chip} aria-pressed={st === 'all'} onClick={() => setSt('all')}>الكل</button>
          {counts.map(([k, n]) => <button key={k} className={p.chip} aria-pressed={st === k} onClick={() => setSt(k)}>{ORDER_LABEL[k]} <span className="num">{n}</span></button>)}
        </div>
      </div>
      {shown.length === 0 ? <div className={p.empty}>لا طلبات.</div> : (
        <div className={p.scroll}><table className={p.table}>
          <thead><tr><th>الطلب</th><th>المشتري</th><th>الدورة</th><th>الإجمالي</th><th>الحالة</th></tr></thead>
          <tbody>
            {shown.map((o) => (
              <tr key={o.id}>
                <td><Link href={`/admin/orders/${o.id}`} className={`${p.rowLink} num`}>{o.number}</Link><div className={`${p.muted} num`}>{when(o.createdAt)}</div></td>
                <td>{o.buyer.name}<div className={`${p.muted} ${p.ltr}`}>{o.buyer.email}</div></td>
                <td>{o.items.map((i) => <div key={i.id}>{i.title.replace(/~\d?/g, '')}{i.quantity > 1 && <span className={`${p.muted} num`}> × {i.quantity}</span>}</div>)}</td>
                <td className="num">{sar(o.total)}{o.couponCode && <div className={p.muted} dir="ltr">{o.couponCode}</div>}</td>
                <td><Badge tone={ORDER_TONE[o.status]}>{ORDER_LABEL[o.status]}</Badge><div className={p.muted}>{METHOD_LABEL[o.method]}</div></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </>
  )
}
