'use client'
/* تسجيل عامل الخدمة — في الإنتاج فقط (في التطوير يعيق التحديث الفوري) */
import { useEffect } from 'react'

export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    const go = () => navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
    if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true })
  }, [])
  return null
}
