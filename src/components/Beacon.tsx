'use client'
/* يرسل المسار عند كل تنقّل — لا شيء غيره. يُحترم «عدم التتبع» في المتصفح والخادم. */
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

export function Beacon() {
  const path = usePathname()
  useEffect(() => {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
    if (nav.doNotTrack === '1' || nav.globalPrivacyControl) return
    try { navigator.sendBeacon?.('/api/v', path) } catch { /* لا شيء */ }
  }, [path])
  return null
}
