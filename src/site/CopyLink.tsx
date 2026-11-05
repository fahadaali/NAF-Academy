'use client'
import { useState } from 'react'
import { timing } from '@/motion/tokens'

export function CopyLink({ url, label = 'نسخ الرابط' }: { url: string; label?: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button type="button" className="btn ghost" onClick={async () => { try { await navigator.clipboard.writeText(url); setOk(true); setTimeout(() => setOk(false), timing.notice) } catch { /* المتصفح يمنع الحافظة */ } }} aria-live="polite">
      {ok ? 'نُسخ ✓' : label}
    </button>
  )
}
