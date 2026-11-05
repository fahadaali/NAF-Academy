'use client'
import { useRouter } from 'next/navigation'
import { moderateReview } from './actions'
import p from '@/admin/ui/panel.module.css'

export function Moderate({ id, status }: { id: string; status: string }) {
  const router = useRouter()
  const go = async (s: 'approved' | 'hidden') => { await moderateReview(id, s); router.refresh() }
  return (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      {status !== 'approved' && <button className="btn" onClick={() => go('approved')}>نشر</button>}
      {status !== 'hidden' && <button className={`${p.iconBtn} ${p.danger}`} onClick={() => go('hidden')}>إخفاء</button>}
    </span>
  )
}
