'use client'
import { useState } from 'react'

export function CopyLink({ url, label = 'نسخ الرابط' }: { url: string; label?: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button type="button" className="btn ghost" onClick={async () => { try { await navigator.clipboard.writeText(url); setOk(true); setTimeout(() => setOk(false), 1800) } catch { /* المتصفح يمنع الحافظة */ } }} aria-live="polite">
      {ok ? 'نُسخ ✓' : label}
    </button>
  )
}
