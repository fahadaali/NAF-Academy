'use client'
/* رفّ المسارات — مجلدات ثلاثية الأبعاد على تمرير أفقي أصلي (scroll-snap).
   كل مجلد يدور حسب بعده عن مركز الرف، ويُسحب بالفأرة، ويتقلّب عند المرور. */
import { useEffect, useRef } from 'react'
import type { Track } from '@/content/types'
import { Words } from '@/components/Words'
import styles from './TrackShelf.module.css'

export function TrackShelf({ tracks }: { tracks: Track[] }) {
  const rail = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = rail.current
    if (!el) return
    const cards = Array.from(el.querySelectorAll<HTMLElement>('[data-card]'))
    let raf = 0
    const paint = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      const mid = r.left + r.width / 2
      const rects = cards.map((c) => c.getBoundingClientRect())
      rects.forEach((cr, i) => {
        const d = (cr.left + cr.width / 2 - mid) / (r.width / 2)
        const k = Math.max(-1.4, Math.min(1.4, d))
        cards[i].style.setProperty('--d', k.toFixed(3))
        cards[i].style.setProperty('--a', Math.min(1, Math.abs(k)).toFixed(3))
      })
    }
    const req = () => { if (!raf) raf = requestAnimationFrame(paint) }
    paint()
    el.addEventListener('scroll', req, { passive: true })
    addEventListener('resize', req, { passive: true })

    /* سحب بالفأرة (اللمس أصلي) */
    let down = false, sx = 0, sl = 0, moved = 0
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      down = true; moved = 0; sx = e.clientX; sl = el.scrollLeft
      el.dataset.drag = '1'
    }
    const onMove = (e: PointerEvent) => {
      if (!down) return
      const dx = e.clientX - sx
      moved = Math.max(moved, Math.abs(dx))
      el.scrollLeft = sl - dx
    }
    const onUp = () => { down = false; el.dataset.drag = '0' }
    const onClick = (e: MouseEvent) => { if (moved > 6) { e.preventDefault(); e.stopPropagation() } }
    el.addEventListener('pointerdown', onDown)
    addEventListener('pointermove', onMove, { passive: true })
    addEventListener('pointerup', onUp)
    el.addEventListener('click', onClick, true)
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('scroll', req)
      removeEventListener('resize', req)
      el.removeEventListener('pointerdown', onDown)
      removeEventListener('pointermove', onMove)
      removeEventListener('pointerup', onUp)
      el.removeEventListener('click', onClick, true)
    }
  }, [])

  const nudge = (dir: 1 | -1) => {
    const el = rail.current
    if (!el) return
    const card = el.querySelector<HTMLElement>('[data-card]')
    el.scrollBy({ left: dir * ((card?.offsetWidth ?? 300) + 24), behavior: 'smooth' })
  }

  return (
    <section id="tracks" className={styles.shelf} aria-labelledby="tracks-title">
      <div className={`wrap ${styles.head}`}>
        <div>
          <span className="eyebrow">ستة مسارات</span>
          <Words as="h2" id="tracks-title" text="اختر مسارك، وابدأ من درجتك." className="scene-title" />
        </div>
        <div className={styles.arrows}>
          <button onClick={() => nudge(1)} aria-label="السابق">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </button>
          <button onClick={() => nudge(-1)} aria-label="التالي">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
        </div>
      </div>

      <div ref={rail} className={styles.rail} data-drag="0">
        <ul role="list" className={styles.list}>
          {tracks.map((t, i) => (
            <li key={t.slug} className={`reveal ${styles.item}`} style={{ ['--d' as string]: i }}>
              <a href={`/tracks/${t.slug}`} data-card className={styles.card} data-tone={t.tone} draggable={false}>
                <span className={styles.spine} aria-hidden="true" />
                <span className={styles.face}>
                  <span className={styles.top}>
                    <span className={styles.kicker}>{t.kicker}</span>
                    <span className={`${styles.count} num`}>{t.courseCount} دورات</span>
                  </span>
                  <span className={styles.glyph} aria-hidden="true">{t.glyph}</span>
                  <span className={styles.bottom}>
                    <strong className={styles.name}>{t.title}</strong>
                    <span className={styles.sum}>{t.summary}</span>
                    <span className={styles.go}>
                      ادخل المسار
                      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
                    </span>
                  </span>
                </span>
                <span className={styles.shine} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
