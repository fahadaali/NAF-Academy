'use client'
/* يشغّل طبقة الحركة العامة مرة واحدة: الكشف بالتمرير، ورفع الستار، وتوهّج الأزرار. */
import { useEffect } from 'react'
import { mountReveal } from '@/motion/reveal'
import { duration, timing } from '@/motion/tokens'

export function MotionRoot() {
  useEffect(() => {
    const root = document.documentElement
    const stopReveal = mountReveal()

    /* الستار: ننتظر الخط (بسقف)، ثم تكتمل كتابة الشعار كاملة (حركاته نفسها، بسقف timing.curtainMax)، ثم وقفة قصيرة ثم يُرفع */
    let t1: ReturnType<typeof setTimeout> | undefined
    let t2: ReturnType<typeof setTimeout> | undefined
    if (root.classList.contains('opening')) {
      const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
      const cap = (ms: number) => new Promise((r) => setTimeout(r, ms))
      const start = performance.now()
      const drawn = () => {
        const c = document.querySelector('[data-curtain]')
        const anims = c && 'getAnimations' in c ? c.getAnimations({ subtree: true }) : []
        return Promise.all(anims.map((a) => a.finished.catch(() => null)))
      }
      Promise.race([fonts?.ready ?? Promise.resolve(), cap(timing.curtain)])
        .then(() => Promise.race([drawn(), cap(Math.max(0, timing.curtainMax - (performance.now() - start)))]))
        .then(() => {
        const hold = Math.max(duration.gentle, timing.curtain * 1.35 - (performance.now() - start))
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
