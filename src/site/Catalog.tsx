'use client'
/* فهرس الدورات — فلترة فورية بالمسار والنمط والدرجة، مع انتقال ناعم بين النتائج. */
import { useMemo, useState } from 'react'
import type { Course, Instructor, Track } from '@/content/types'
import { CourseCard } from '@/components/CourseCard'
import { levelLabel, modeLabel } from '@/lib/course-meta'
import { DELIVERY, LEVEL } from '@/lib/enums'
import s from './catalog.module.css'

type Props = { courses: Course[]; tracks: Track[]; instructors: Instructor[]; initialTrack?: string }

export function Catalog({ courses, tracks, instructors, initialTrack = 'all' }: Props) {
  const [track, setTrack] = useState(initialTrack)
  const [mode, setMode] = useState('all')
  const [level, setLevel] = useState('all')
  const [openOnly, setOpenOnly] = useState(false)
  const [q, setQ] = useState('')
  const shown = useMemo(() => courses.filter((c) =>
    (track === 'all' || c.track === track) && (mode === 'all' || c.mode === mode) && (level === 'all' || c.level === level) &&
    (!openOnly || c.status === 'open') && (!q || c.title.replace(/~\d?/g, '').includes(q))), [courses, track, mode, level, openOnly, q])
  const key = [track, mode, level, openOnly, q].join('|')

  const chip = (on: boolean, label: string, fn: () => void, k: string) => (
    <button key={k} className={s.chip} aria-pressed={on} onClick={fn}>{label}</button>
  )

  return (
    <div className={s.catalog}>
      <div className={s.filters}>
        <input className={s.search} type="search" placeholder="ابحث عن دورة…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث" />
        <div className={s.row} role="group" aria-label="المسار">
          {chip(track === 'all', 'كل المسارات', () => setTrack('all'), 'all')}
          {tracks.map((t) => chip(track === t.slug, t.title, () => setTrack(t.slug), t.slug))}
        </div>
        <div className={s.row}>
          <div className={s.row} role="group" aria-label="النمط">
            {chip(mode === 'all', 'كل الأنماط', () => setMode('all'), 'm-all')}
            {DELIVERY.map((m) => chip(mode === m, modeLabel[m], () => setMode(m), m))}
          </div>
          <span className={s.sep} aria-hidden="true" />
          <div className={s.row} role="group" aria-label="الدرجة">
            {chip(level === 'all', 'كل الدرجات', () => setLevel('all'), 'l-all')}
            {LEVEL.map((l) => chip(level === l, levelLabel[l], () => setLevel(l), l))}
          </div>
          <span className={s.sep} aria-hidden="true" />
          {chip(openOnly, 'التسجيل مفتوح فقط', () => setOpenOnly((x) => !x), 'open')}
        </div>
      </div>
      <h2 className="sr-only">نتائج البحث</h2>
      <p className={`${s.count} num`} role="status">{shown.length} دورة</p>
      <div className={s.grid} key={key}>
        {shown.length === 0 && <p className={s.none}>لا دورات بهذه المواصفات الآن — جرّب فلتراً آخر.</p>}
        {shown.map((c, i) => (
          <div key={c.slug} className={s.item} style={{ ['--i' as string]: i }}>
            <CourseCard course={c} track={tracks.find((t) => t.slug === c.track)} instructor={instructors.find((p) => p.slug === c.instructor)} />
          </div>
        ))}
      </div>
    </div>
  )
}
