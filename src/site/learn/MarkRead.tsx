'use client'
import { useRouter } from 'next/navigation'
import { markInboxRead } from '@/site/inbox-actions'

export function MarkRead() {
  const router = useRouter()
  return <button type="button" className="btn ghost" onClick={async () => { await markInboxRead(); router.refresh() }}>تعليم الكل مقروءاً</button>
}
