'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { setEnrollment } from './actions'
import { Badge, PageHead } from '@/admin/ui/kit'
import { when } from './labels'
import p from '@/admin/ui/panel.module.css'

type Enroll = { e: { id: string; status: 'active' | 'canceled'; source: string; createdAt: string; orderId: string | null }; l: { name: string; email: string; phone: string; org: string }; number: string | null; tier: string | null }
type Interest = { id: string; kind: string; name: string; email: string; phone: string; createdAt: string }

const SOURCE: Record<string, string> = { purchase: 'شراء', free: 'مجاني', grant: 'منحة', manual: 'يدوي', seat: 'مقعد مؤسسة' }
const KIND: Record<string, string> = { notify_open: 'أبلغني عند الفتح', waitlist: 'قائمة الانتظار', next_cohort: 'الدفعة القادمة', register: 'اهتمام بالتسجيل' }

function download(name: string, rows: (string | number)[][]) {
  const text = '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  a.download = name
  a.click()
}

export function LearnersBoard({ courseId, title, enrolls, interest }: { courseId: string; title: string; enrolls: Enroll[]; interest: Interest[] }) {
  const [list, setList] = useState(enrolls)
  const [, start] = useTransition()
  const active = list.filter((x) => x.e.status === 'active').length
  return (
    <>
      <PageHead title="المسجّلون" sub={`${title.replace(/~\d?/g, '')} · ${active} تسجيل نشط · ${interest.length} مهتم`}
        actions={<>
          <button className="btn ghost" onClick={() => download('learners.csv', [['الاسم', 'البريد', 'الجوال', 'الجهة', 'المصدر', 'الباقة', 'الطلب', 'الحالة', 'التاريخ'], ...list.map((x) => [x.l.name, x.l.email, x.l.phone, x.l.org, SOURCE[x.e.source], x.tier ?? '', x.number ?? '', x.e.status === 'active' ? 'نشط' : 'ملغى', x.e.createdAt])])}>تصدير المسجّلين</button>
          <Link className="btn" href="/admin/orders/new">+ تسجيل يدوي</Link>
          <Link className="btn ghost" href={`/admin/courses/${courseId}`}>العودة للدورة</Link>
        </>} />
      {list.length === 0 ? <div className={p.empty}>لا تسجيلات بعد.</div> : (
        <table className={p.table}>
          <thead><tr><th>المتدرب</th><th>المصدر</th><th>الطلب</th><th>التاريخ</th><th>الحالة</th></tr></thead>
          <tbody>
            {list.map((x) => (
              <tr key={x.e.id}>
                <td><strong>{x.l.name}</strong><div className={p.muted} dir="ltr" style={{ textAlign: 'end' }}>{x.l.email}</div></td>
                <td>{SOURCE[x.e.source]}{x.tier && <div className={p.muted}>{x.tier}</div>}</td>
                <td>{x.number && x.e.orderId ? <Link className={`${p.rowLink} num`} href={`/admin/orders/${x.e.orderId}`}>{x.number}</Link> : '—'}</td>
                <td className={`${p.muted} num`}>{when(x.e.createdAt)}</td>
                <td>
                  <Badge tone={x.e.status === 'active' ? 'open' : 'draft'}>{x.e.status === 'active' ? 'نشط' : 'ملغى'}</Badge>{' '}
                  <button className={p.iconBtn} onClick={() => {
                    const next = x.e.status === 'active' ? 'canceled' : 'active'
                    if (next === 'canceled' && !confirm(`إلغاء تسجيل ${x.l.name}؟ لا يُسترد المبلغ تلقائياً — الاسترداد من صفحة الطلب.`)) return
                    const prev = x.e.status
                    setList((l) => l.map((y) => (y.e.id === x.e.id ? { ...y, e: { ...y.e, status: next } } : y)))
                    start(async () => {
                      const r = await setEnrollment(x.e.id, next)
                      if (!r.ok) { setList((l) => l.map((y) => (y.e.id === x.e.id ? { ...y, e: { ...y.e, status: prev } } : y))); alert(r.error) }
                    })
                  }}>{x.e.status === 'active' ? 'إلغاء' : 'تفعيل'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h2 style={{ fontSize: 20, margin: '30px 0 12px', display: 'flex', justifyContent: 'space-between' }}>
        المهتمون وقوائم الانتظار <span className="num">({interest.length})</span>
      </h2>
      {interest.length === 0 ? <div className={p.empty}>لا أحد بعد.</div> : (
        <>
          <table className={p.table}>
            <thead><tr><th>الاسم</th><th>البريد</th><th>النوع</th><th>التاريخ</th></tr></thead>
            <tbody>{interest.map((i) => <tr key={i.id}><td>{i.name || '—'}</td><td dir="ltr" style={{ textAlign: 'end' }}>{i.email}</td><td>{KIND[i.kind]}</td><td className={`${p.muted} num`}>{when(i.createdAt)}</td></tr>)}</tbody>
          </table>
          <button className="btn ghost" style={{ marginBlockStart: 12 }} onClick={() => download('interest.csv', [['الاسم', 'البريد', 'الجوال', 'النوع', 'التاريخ'], ...interest.map((i) => [i.name, i.email, i.phone, KIND[i.kind], i.createdAt])])}>تصدير المهتمين</button>
        </>
      )}
    </>
  )
}
