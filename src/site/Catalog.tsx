'use client'
/* فهرس الدورات — شريط هادئ: أيقونة بحث تتمدد حقلاً عند الضغط، وزر «تصفية» يتكشّف طبقةً طبقة
   (الأقسام ← خيارات القسم ← عودة إلى الأقسام)، فلا يظهر من الخيارات إلا ما طُلب. النتائج تتبدّل بانتقال ناعم. */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Course, Instructor, Track } from '@/content/types'
import { CourseCard } from '@/components/CourseCard'
import { levelLabel, modeLabel } from '@/lib/course-meta'
import { DELIVERY, LEVEL } from '@/lib/enums'
import s from './catalog.module.css'

type Props = { courses: Course[]; tracks: Track[]; instructors: Instructor[]; initialTrack?: string }
type Facet = 'track' | 'mode' | 'level'

const Icon = {
  search: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4.5 4.5" /></svg>,
  filter: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M7 12h10M10 17h4" /></svg>,
  close: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>,
  chevron: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>,
}

export function Catalog({ courses, tracks, instructors, initialTrack = 'all' }: Props) {
  const [track, setTrack] = useState(initialTrack)
  const [mode, setMode] = useState('all')
  const [level, setLevel] = useState('all')
  const [openOnly, setOpenOnly] = useState(false)
  const [q, setQ] = useState('')
  const [searching, setSearching] = useState(false)
  /* null = الشريط مطويّ · 'root' = الأقسام · قسم = خياراته */
  const [layer, setLayer] = useState<null | 'root' | Facet>(null)
  const input = useRef<HTMLInputElement>(null)
  const field = useRef<HTMLDivElement>(null)
  const drill = useRef<HTMLDivElement>(null)
  /* التنقّل بين الطبقات يبدّل الأزرار — فالتركيز ينتقل إلى ما يقابله لا إلى أول الصفحة */
  const focusTo = useRef<string | null>(null)
  const go = (to: 'root' | Facet, focus: string) => { focusTo.current = focus; setLayer(to) }

  const shown = useMemo(() => courses.filter((c) =>
    (track === 'all' || c.track === track) && (mode === 'all' || c.mode === mode) && (level === 'all' || c.level === level) &&
    (!openOnly || c.status === 'open') && (!q || c.title.replace(/~\d?/g, '').includes(q.trim()))), [courses, track, mode, level, openOnly, q])
  const key = [track, mode, level, openOnly, q].join('|')

  /* صفحة المسار تمرّر مساره وحده — لا قسم «المسار» فيها */
  const facets = useMemo(() => {
    const list: { k: Facet; name: string; value: string; set: (x: string) => void; options: [string, string][] }[] = []
    if (tracks.length > 1) list.push({ k: 'track', name: 'المسار', value: track, set: setTrack, options: [['all', 'كل المسارات'], ...tracks.map((t) => [t.slug, t.title] as [string, string])] })
    list.push({ k: 'mode', name: 'النمط', value: mode, set: setMode, options: [['all', 'كل الأنماط'], ...DELIVERY.map((m) => [m, modeLabel[m]] as [string, string])] })
    list.push({ k: 'level', name: 'الدرجة', value: level, set: setLevel, options: [['all', 'كل الدرجات'], ...LEVEL.map((l) => [l, levelLabel[l]] as [string, string])] })
    return list
  }, [tracks, track, mode, level])
  const active = facets.filter((f) => f.value !== 'all').length + (openOnly ? 1 : 0)
  const facet = facets.find((f) => f.k === layer)

  useEffect(() => { if (searching) input.current?.focus() }, [searching])
  useEffect(() => {
    if (!focusTo.current) return
    drill.current?.querySelector<HTMLButtonElement>(`[data-k="${focusTo.current}"]`)?.focus()
    focusTo.current = null
  }, [layer, active])

  const closeSearch = () => { setQ(''); setSearching(false) }
  const reset = () => { facets.forEach((f) => f.set('all')); setOpenOnly(false); go('root', facets[0].k) }

  return (
    <div className={s.catalog}>
      <div className={s.filters}>
        <div className={s.bar}>
          <button type="button" className={s.filterBtn} aria-expanded={layer !== null} aria-controls="catalog-filters"
            data-active={active ? '1' : '0'} onClick={() => setLayer((x) => (x === null ? 'root' : null))}>
            {Icon.filter}<span>تصفية</span>
            {active > 0 && <span className={`${s.badge} num`} aria-label={`${active} مفعّلة`}>{active}</span>}
          </button>
          <div className={s.searchCell}>
            <button type="button" className={s.iconBtn} aria-label="ابحث عن دورة" aria-expanded={searching} aria-controls="catalog-q"
              onClick={() => setSearching(true)} tabIndex={searching ? -1 : 0}>
              {Icon.search}
            </button>
            <div ref={field} className={s.field} data-open={searching ? '1' : '0'} inert={!searching}
              onBlur={(e) => { if (!q && !field.current?.contains(e.relatedTarget as Node | null)) setSearching(false) }}>
              <span className={s.fieldIcon}>{Icon.search}</span>
              <input ref={input} id="catalog-q" className={s.search} type="search" enterKeyHint="search" placeholder="ابحث عن دورة…" value={q}
                onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') closeSearch() }} aria-label="بحث" />
              <button type="button" className={s.clear} aria-label="إغلاق البحث" onClick={closeSearch}>{Icon.close}</button>
            </div>
          </div>
        </div>

        {layer !== null && (
          <div id="catalog-filters" ref={drill} className={s.drill} key={layer} role="group" aria-label={facet ? facet.name : 'تصفية الدورات'}
            onKeyDown={(e) => { if (e.key === 'Escape') { if (facet) go('root', facet.k); else setLayer(null) } }}>
            {facet ? (
              <>
                <button type="button" className={s.back} data-k="back" onClick={() => go('root', facet.k)} aria-label={`رجوع من ${facet.name}`}>
                  {Icon.chevron}<span>{facet.name}</span>
                </button>
                {facet.options.map(([v, label], i) => (
                  <button key={v} type="button" className={s.chip} style={{ ['--i' as string]: i + 1 }} aria-pressed={facet.value === v}
                    onClick={() => { facet.set(v); go('root', facet.k) }}>{label}</button>
                ))}
              </>
            ) : (
              <>
                {facets.map((f, i) => {
                  const on = f.value !== 'all'
                  return (
                    <button key={f.k} type="button" className={s.facet} style={{ ['--i' as string]: i }} data-k={f.k} data-on={on ? '1' : '0'} onClick={() => go(f.k, 'back')}>
                      <span className={s.facetName}>{f.name}</span>
                      {on && <span className={s.facetValue}>{f.options.find(([v]) => v === f.value)?.[1]}</span>}
                      {Icon.chevron}
                    </button>
                  )
                })}
                <button type="button" className={s.chip} style={{ ['--i' as string]: facets.length }} aria-pressed={openOnly} onClick={() => setOpenOnly((x) => !x)}>التسجيل مفتوح</button>
                {active > 0 && <button type="button" className={s.reset} style={{ ['--i' as string]: facets.length + 1 }} onClick={reset}>مسح الكل</button>}
              </>
            )}
          </div>
        )}
      </div>
      <h2 className="sr-only">نتائج البحث</h2>
      <p className={`${s.count} num`} role="status">{shown.length} دورة</p>
      <div className={s.grid} key={key}>
        {shown.length === 0 && <p className={s.none}>لا دورات بهذه المواصفات الآن — جرّب بحثاً أو تصفية أخرى.</p>}
        {shown.map((c, i) => (
          <div key={c.slug} className={s.item} style={{ ['--i' as string]: i }}>
            <CourseCard course={c} track={tracks.find((t) => t.slug === c.track)} instructor={instructors.find((p) => p.slug === c.instructor)} />
          </div>
        ))}
      </div>
    </div>
  )
}
