'use client'
/* تبويب «الدفعات» في محرّر الدورة — لكل دفعة مواعيدها ومقاعدها، ومواعيد الجلسات المباشرة والحضورية لكل درس.
   يُحفظ مستقلاً عن الدورة (للدفعة متدربوها)، والدورة بلا دفعات تعمل بمواعيد دروسها كما هي. */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge, DateTime, Field, Grid, Input, Section, Segmented, Textarea } from '@/admin/ui/kit'
import { cloneCohort, saveCohort } from './actions'
import { trash } from '@/admin/actions'
import type { CohortInput } from '@/admin/schemas'
import type { CohortRow, CohortSessionRow } from '@/server/db/schema'
import { formatDay } from '@/lib/dates'
import p from '@/admin/ui/panel.module.css'
import c from './cohorts.module.css'

type Item = { row: CohortRow; used: number; sessions: CohortSessionRow[] }
type SessionLesson = { id: string; title: string; type: 'live' | 'onsite' }

const STATUS = [
  { value: 'soon' as const, label: 'قريباً' },
  { value: 'open' as const, label: 'التسجيل مفتوح' },
  { value: 'closed' as const, label: 'مغلقة' },
]
const TONE = { soon: 'soon', open: 'open', closed: 'draft' } as const

function blank(lessons: SessionLesson[]): CohortInput {
  return { title: '', status: 'soon', startsAt: null, endsAt: null, seatsTotal: null, seatsTaken: 0, city: '', venue: '', sessions: lessons.map((l) => ({ lessonId: l.id, startsAt: null, endsAt: null, joinUrl: '', location: '', recording: '' })) }
}

function toInput(it: Item, lessons: SessionLesson[]): CohortInput {
  const { row } = it
  return {
    title: row.title, status: row.status, startsAt: row.startsAt, endsAt: row.endsAt, seatsTotal: row.seatsTotal, seatsTaken: row.seatsTaken, city: row.city, venue: row.venue,
    sessions: lessons.map((l) => {
      const x = it.sessions.find((y) => y.lessonId === l.id)
      const r = x?.recording
      return { lessonId: l.id, startsAt: x?.startsAt ?? null, endsAt: x?.endsAt ?? null, joinUrl: x?.joinUrl ?? '', location: x?.location ?? '', recording: r?.provider === 'stream' ? r.uid : r?.provider === 'url' ? r.url : '' }
    }),
  }
}

export function CohortsPanel({ courseId, items, lessons, canWrite }: { courseId: string; items: Item[]; lessons: SessionLesson[]; canWrite: boolean }) {
  const router = useRouter()
  const [edit, setEdit] = useState<{ id: string | null; v: CohortInput } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const save = async () => {
    if (!edit) return
    setBusy(true)
    const r = await saveCohort(courseId, edit.id, edit.v)
    setBusy(false)
    if (!r.ok) return setMsg(r.error)
    setEdit(null)
    setMsg('')
    router.refresh()
  }
  const set = (patch: Partial<CohortInput>) => setEdit((e) => (e ? { ...e, v: { ...e.v, ...patch } } : e))
  const setSession = (i: number, patch: Partial<CohortInput['sessions'][number]>) =>
    setEdit((e) => (e ? { ...e, v: { ...e.v, sessions: e.v.sessions.map((x, j) => (j === i ? { ...x, ...patch } : x)) } } : e))

  return (
    <Section title="الدفعات" desc="لكل دفعة مواعيدها ومقاعدها والمنهج واحد. متى وُجدت دفعة صار اختيارها شرطاً للتسجيل، وحلّت سعتها محل سعة الدورة.">
      {items.length === 0 && !edit && <div className={p.empty}>الدورة بلا دفعات — تُباع بمواعيد دروسها وسعتها في «الموعد والمكان».</div>}
      <ul className={c.list} role="list">
        {items.map((it) => (
          <li key={it.row.id} className={c.card}>
            <div>
              <strong>{it.row.title}</strong> <Badge tone={TONE[it.row.status]}>{STATUS.find((x) => x.value === it.row.status)?.label}</Badge>
              <div className={`${p.muted} num`}>
                {it.row.startsAt ? formatDay(it.row.startsAt) : 'بلا موعد'}{it.row.endsAt ? ` ← ${formatDay(it.row.endsAt)}` : ''}
                {' · '}{it.row.seatsTotal ? `${it.used} / ${it.row.seatsTotal} مقعد` : `${it.used} مسجّل`}
                {' · '}{it.sessions.filter((x) => x.startsAt).length} / {lessons.length} جلسة بموعد
              </div>
            </div>
            {canWrite && (
              <div className={c.tools}>
                <button type="button" className={p.iconBtn} onClick={() => setEdit({ id: it.row.id, v: toInput(it, lessons) })}>تعديل</button>
                <button type="button" className={p.iconBtn} onClick={async () => {
                  const title = prompt('اسم الدفعة الجديدة', '')
                  if (!title) return
                  const when = prompt('تاريخ بدئها (YYYY-MM-DD) — تُزاح مواعيد الجلسات بالفارق نفسه', it.row.startsAt?.slice(0, 10) ?? '')
                  if (!when || !/^\d{4}-\d{2}-\d{2}$/.test(when)) return
                  const time = it.row.startsAt ? new Date(it.row.startsAt).toISOString().slice(10) : 'T06:00:00.000Z'
                  const r = await cloneCohort(it.row.id, title, `${when}${time}`)
                  if (!r.ok) alert(r.error)
                  else router.refresh()
                }}>دفعة جديدة منها</button>
                <button type="button" className={p.iconBtn} onClick={async () => {
                  if (it.used > 0) return alert('في الدفعة متدربون — انقلهم إلى دفعة أخرى من صفحة المسجّلين أولاً')
                  if (!confirm(`نقل «${it.row.title}» إلى المحذوفات؟`)) return
                  const r = await trash('cohort', it.row.id)
                  if (!r.ok) alert(r.error)
                  router.refresh()
                }}>حذف</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {canWrite && !edit && <button type="button" className="btn ghost" onClick={() => setEdit({ id: null, v: blank(lessons) })}>+ دفعة</button>}

      {edit && (
        <div className={c.editor}>
          <Grid>
            <Field label="اسم الدفعة" wide><Input value={edit.v.title} onChange={(e) => set({ title: e.target.value })} placeholder="الدفعة الثالثة — ربيع 2027" /></Field>
          </Grid>
          <Field label="الحالة"><Segmented value={edit.v.status} onChange={(status) => set({ status })} options={STATUS} /></Field>
          <Grid>
            <Field label="البداية"><DateTime value={edit.v.startsAt} onChange={(startsAt) => set({ startsAt })} /></Field>
            <Field label="النهاية" hint="بعدها تُغلق الدفعة تلقائياً، ومنها تُحسب مدة الوصول"><DateTime value={edit.v.endsAt} onChange={(endsAt) => set({ endsAt })} /></Field>
          </Grid>
          <Grid cols={3}>
            <Field label="السعة" hint="فارغ = بلا حد"><Input type="number" dir="ltr" min={1} value={edit.v.seatsTotal ?? ''} onChange={(e) => set({ seatsTotal: e.target.value ? Number(e.target.value) : null })} /></Field>
            <Field label="محجوز يدوياً"><Input type="number" dir="ltr" min={0} value={edit.v.seatsTaken} onChange={(e) => set({ seatsTaken: Number(e.target.value) })} /></Field>
            <Field label="المدينة"><Input value={edit.v.city} onChange={(e) => set({ city: e.target.value })} /></Field>
          </Grid>
          <Field label="المقر وتعليمات الوصول" wide><Textarea rows={2} value={edit.v.venue} onChange={(e) => set({ venue: e.target.value })} /></Field>

          <h4 className={c.h}>مواعيد الجلسات</h4>
          {lessons.length === 0 ? <p className={p.muted}>لا جلسات مباشرة أو حضورية في المنهج — أضفها واحفظ الدورة أولاً.</p> : (
            <div className={p.scroll}><table className={p.table}>
              <thead><tr><th>الجلسة</th><th>البداية</th><th>النهاية</th><th>رابط الانضمام / المكان</th><th>التسجيل</th></tr></thead>
              <tbody>
                {edit.v.sessions.map((x, i) => {
                  const l = lessons.find((y) => y.id === x.lessonId)!
                  return (
                    <tr key={x.lessonId}>
                      <td>{l.title}<div className={p.muted}>{l.type === 'live' ? 'مباشرة' : 'حضورية'}</div></td>
                      <td><DateTime value={x.startsAt} onChange={(startsAt) => setSession(i, { startsAt })} /></td>
                      <td><DateTime value={x.endsAt} onChange={(endsAt) => setSession(i, { endsAt })} /></td>
                      <td>{l.type === 'live'
                        ? <Input dir="ltr" value={x.joinUrl} onChange={(e) => setSession(i, { joinUrl: e.target.value })} placeholder="https://zoom.us/j/…" />
                        : <Input value={x.location} onChange={(e) => setSession(i, { location: e.target.value })} placeholder="القاعة والدور" />}</td>
                      <td>{l.type === 'live' && <Input dir="ltr" value={x.recording ?? ''} onChange={(e) => setSession(i, { recording: e.target.value.trim() })} placeholder="تلقائي من Zoom، أو معرّف Stream / رابط" />}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
          )}
          {msg && <p className={c.err} role="alert">{msg}</p>}
          <div className={c.actions}>
            <button type="button" className="btn" disabled={busy} onClick={save}>{busy ? 'يُحفظ…' : 'حفظ الدفعة'}</button>
            <button type="button" className="btn ghost" onClick={() => { setEdit(null); setMsg('') }}>إلغاء</button>
          </div>
        </div>
      )}
    </Section>
  )
}
