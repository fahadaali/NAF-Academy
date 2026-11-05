'use client'
import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { CourseRow, Media, TrackRow } from '@/server/db/schema'
import type { CourseStatus } from '@/content/types'
import { duplicateCourse, reorder, setCourseStatus, trash } from '@/admin/actions'
import { Badge, PageHead, useSortable } from '@/admin/ui/kit'
import { modeLabel } from '@/lib/course-meta'
import { formatAmount } from '@/lib/pricing'
import { formatDay } from '@/lib/dates'
import { urlOf } from '@/admin/ui/MediaPicker'
import { STATUS_LABEL, STATUS_ORDER } from './labels'
import { useCan } from '@/admin/ui/perms'
import p from '@/admin/ui/panel.module.css'

export function CoursesTable({ courses, tracks, media }: { courses: CourseRow[]; tracks: TrackRow[]; media: Media[] }) {
  const write = useCan()('content.write')
  const router = useRouter()
  const [list, setList] = useState(courses)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<CourseStatus | 'all'>('all')
  const [track, setTrack] = useState<string>('all')
  const [, start] = useTransition()
  const tName = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks])
  const mOf = useMemo(() => new Map(media.map((m) => [m.id, m])), [media])

  const shown = list.filter((c) =>
    (status === 'all' || c.status === status) && (track === 'all' || c.trackId === track) && (!q || c.title.includes(q) || c.slug.includes(q)))
  const filtering = status !== 'all' || track !== 'all' || !!q
  const { props, move } = useSortable(list, (next) => { setList(next); start(() => reorder('course', next.map((c) => c.id))) })

  const counts = STATUS_ORDER.map((s) => [s, list.filter((c) => c.status === s).length] as const).filter(([, n]) => n > 0)

  return (
    <>
      <PageHead title="الدورات" sub={`${list.length} دورة — اسحب الصفوف لترتيب ظهورها`} actions={write ? <Link href="/admin/courses/new" className="btn">+ دورة جديدة</Link> : null} />
      <div className={p.toolbar}>
        <input className={p.search} placeholder="ابحث بالعنوان أو الرابط…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className={p.chips}>
          <button className={p.chip} aria-pressed={status === 'all'} onClick={() => setStatus('all')}>الكل</button>
          {counts.map(([s, n]) => (
            <button key={s} className={p.chip} aria-pressed={status === s} onClick={() => setStatus(s)}>{STATUS_LABEL[s]} <span className="num">{n}</span></button>
          ))}
        </div>
        <select aria-label="المسار" className={p.search} style={{ minInlineSize: 180 }} value={track} onChange={(e) => setTrack(e.target.value)}>
          <option value="all">كل المسارات</option>
          {tracks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
      </div>

      {shown.length === 0 ? <div className={p.empty}>لا دورات مطابقة.</div> : (
        <table className={p.table}>
          <thead><tr><th>الدورة</th><th>الحالة</th><th>النمط</th><th>الموعد</th><th>السعر</th><th><span className="sr-only">إجراءات</span></th></tr></thead>
          <tbody>
            {shown.map((c) => {
              const i = list.indexOf(c)
              const t = tName.get(c.trackId ?? '')
              const cover = mOf.get(c.coverId ?? '')
              return (
                <tr key={c.id} {...(filtering || !write ? {} : props(i))}>
                  <td>
                    <div className={p.cellRow}>
                      {!filtering && write && <span style={{ cursor: 'grab', color: 'var(--muted)' }} aria-hidden="true">⋮⋮</span>}
                      <span className={p.thumb}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {cover ? <img src={urlOf(cover)} alt="" style={{ inlineSize: '100%', blockSize: '100%', objectFit: 'cover' }} /> : t?.glyph}
                      </span>
                      <div>
                        <Link href={`/admin/courses/${c.id}`} className={p.rowLink}>{c.title}</Link>
                        <div className={p.muted}>{t?.title ?? 'بلا مسار'} · /{c.slug}{c.featured ? ' · ★ مميزة' : ''}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {write && <select
                      aria-label="الحالة"
                      className={p.search}
                      style={{ minInlineSize: 0, minBlockSize: 34, fontSize: 13 }}
                      value={c.status}
                      onChange={(e) => {
                        const s = e.target.value as CourseStatus
                        setList((l) => l.map((x) => (x.id === c.id ? { ...x, status: s } : x)))
                        start(() => setCourseStatus(c.id, s))
                      }}
                    >
                      {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>}
                    <div style={{ marginBlockStart: 4 }}><Badge tone={c.status}>{STATUS_LABEL[c.status]}</Badge></div>
                  </td>
                  <td className={p.muted}>{modeLabel[c.mode]}</td>
                  <td className={`${p.muted} num`}>{c.startsAt ? formatDay(c.startsAt) : '—'}</td>
                  <td className="num">
                    {c.free ? 'مجاني' : <>{formatAmount(c.price)}{c.compareAt ? <>{' '}<s className={p.muted}>{formatAmount(c.compareAt)}</s></> : null}</>}
                  </td>
                  <td>
                    <div className={p.cellRow} style={{ gap: 2, justifyContent: 'end' }}>
                      {!filtering && write && <>
                        <button className={p.iconBtn} aria-label="أعلى" disabled={i === 0} onClick={() => move(i, i - 1)}>↑</button>
                        <button className={p.iconBtn} aria-label="أسفل" disabled={i === list.length - 1} onClick={() => move(i, i + 1)}>↓</button>
                      </>}
                      <a className={p.iconBtn} href={`/courses/${c.slug}/preview/${c.previewToken}`} target="_blank" rel="noreferrer">معاينة</a>
                      {write && <button className={p.iconBtn} onClick={async () => { const r = await duplicateCourse(c.id); if (r.ok) router.push(`/admin/courses/${r.id}`) }}>نسخ</button>}
                      {write && <button className={`${p.iconBtn} ${p.danger}`} onClick={() => {
                        if (!confirm(`نقل «${c.title}» إلى المحذوفات؟ يمكن استرجاعها لاحقاً.`)) return
                        setList((l) => l.filter((x) => x.id !== c.id))
                        start(() => trash('course', c.id))
                      }}>حذف</button>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </>
  )
}
