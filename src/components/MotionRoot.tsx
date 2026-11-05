'use client'
/* يشغّل طبقة الحركة العامة مرة واحدة: الكشف بالتمرير، ورفع الستار، وتوهّج الأزرار. */
import { useEffect } from 'react'
import { mountReveal } from '@/motion/reveal'
import { timing } from '@/motion/tokens'

export function MotionRoot() {
  useEffect(() => {
    const root = document.documentElement
    const stopReveal = mountReveal()

    /* الستار: ننتظر الخط (بسقف) ثم يكتمل رسم العلامة ثم يُرفع */
    let t1: ReturnType<typeof setTimeout> | undefined
    let t2: ReturnType<typeof setTimeout> | undefined
    if (root.classList.contains('opening')) {
      const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
      const ready = Promise.race([fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, timing.curtain))])
      const start = performance.now()
      ready.then(() => {
        const hold = Math.max(0, timing.curtain * 1.35 - (performance.now() - start))
        t1 = setTimeout(() => {
          root.classList.add('unveil')
          document.dispatchEvent(new CustomEvent('academy:unveil'))
          t2 = setTimeout(() => root.classList.remove('opening', 'unveil'), timing.curtain)
        }, hold)
      })
    }

    /* توهّج يتبع المؤشر داخل الأزرار */
    const onMove = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('.btn') as HTMLElement | null
      if (!el) return
      const r = el.getBoundingClientRect()
      el.style.setProperty('--mx', `${e.clientX - r.left}px`)
      el.style.setProperty('--my', `${e.clientY - r.top}px`)
    }
    addEventListener('pointermove', onMove, { passive: true })

    return () => {
      stopReveal()
      clearTimeout(t1)
      clearTimeout(t2)
      removeEventListener('pointermove', onMove)
    }
  }, [])
  return null
}
