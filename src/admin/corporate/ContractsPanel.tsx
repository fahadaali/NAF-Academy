'use client'
/* عقود المؤسسة في اللوحة — العقد (المقاعد، النافذة، النطاق، القيمة، الملف الموقّع)، واستهلاكه، وتخصيص مقاعده. */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { assignFromContract, releaseContractSeat, saveContract, uploadContractFile } from './contracts'
import type { ContractInput } from '@/admin/schemas'
import type { ContractRow } from '@/server/db/schema'
import { Badge, DateTime, Field, Grid, Input, Money, Section, Segmented, Select, Textarea } from '@/admin/ui/kit'
import { Chips } from '@/admin/sales/CouponEditor'
import { formatAmount } from '@/lib/pricing'
import { when } from '@/admin/sales/labels'
import p from '@/admin/ui/panel.module.css'
import c from './corporate.module.css'
import { History } from '@/admin/ui/History'
import { trash } from '@/admin/actions'

type Course = { id: string; title: string; cohorts: { id: string; title: string }[] }
type Seat = { id: string; email: string; name: string; course: string }
export type ContractItem = { row: ContractRow; used: number; state: string; seats: Seat[]; file: string | null }

const STATE: Record<string, [string, string]> = {
  draft: ['draft', 'مسودة'], active: ['open', 'ساري'], upcoming: ['soon', 'يبدأ لاحقاً'], expired: ['closed', 'منتهٍ'], cancelled: ['draft', 'ملغى'],
}
const BLANK: ContractInput = { number: '', title: '', status: 'draft', startsAt: null, endsAt: null, seats: 10, scope: 'all', courseIds: [], total: 0, fileId: null, notes: '' }

export function ContractsPanel({ orgId, items, courses }: { orgId: string; items: ContractItem[]; courses: Course[] }) {
  const router = useRouter()
  const [edit, setEdit] = useState<{ id: string | null; v: ContractInput; fileName: string } | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState('')
  const [seat, setSeat] = useState<{ contract: string; email: string; name: string; courseId: string; cohortId: string }>({ contract: '', email: '', name: '', courseId: '', cohortId: '' })
  const set = <K extends keyof ContractInput>(k: K, x: ContractInput[K]) => setEdit((e) => (e ? { ...e, v: { ...e.v, [k]: x } } : e))

  const save = async () => {
    if (!edit) return
    const r = await saveContract(orgId, edit.id, edit.v)
    if (!r.ok) { setErrors(r.errors); setMsg(r.message ?? Object.values(r.errors)[0] ?? 'راجع الحقول'); return }
    setEdit(null); setErrors({}); setMsg(''); router.refresh()
  }
  const upload = async (f: File) => {
    const fd = new FormData()
    fd.set('file', f)
    const r = await uploadContractFile(fd)
    if (!r.ok) return setMsg(r.error)
    set('fileId', r.id)
    setEdit((e) => (e ? { ...e, fileName: r.name } : e))
  }
  const assign = async (it: ContractItem) => {
    const r = await assignFromContract(it.row.id, { email: seat.email, name: seat.name, courseId: seat.courseId, cohortId: seat.cohortId || null })
    if (!r.ok) return setMsg(r.error ?? 'تعذّر')
    setSeat({ contract: '', email: '', name: '', courseId: '', cohortId: '' }); setMsg(''); router.refresh()
  }
  const scopeCourses = (it: ContractItem) => (it.row.scope === 'all' ? courses : courses.filter((x) => it.row.courseIds.includes(x.id)))

  return (
    <Section title="العقود" desc="مقاعد متفق عليها لنافذة زمنية — يخصّصها الفريق هنا أو مسؤول المؤسسة من لوحته، والوصول حتى نهاية العقد">
      {msg && <p role="alert" className={c.err}>{msg}</p>}
      {!edit && items.length === 0 && <p className={p.muted}>لا عقود بعد.</p>}
      {!edit && items.map((it) => {
        const [tone, label] = STATE[it.state] ?? ['draft', it.state]
        return (
          <article key={it.row.id} className={c.contract}>
            <header>
              <div>
                <strong>{it.row.title}</strong> {it.row.number && <span className={`${p.muted} num`}>· {it.row.number}</span>} <Badge tone={tone}>{label}</Badge>
                <div className={`${p.muted} num`}>
                  {it.row.startsAt ? when(it.row.startsAt) : 'من التوقيع'} ← {it.row.endsAt ? when(it.row.endsAt) : 'بلا نهاية'}
                  {it.row.total > 0 && ` · ${formatAmount(it.row.total)} ر.س`} · {it.row.scope === 'all' ? 'كل الدورات' : `${it.row.courseIds.length} دورة`}
                </div>
              </div>
              <div className={c.tools}>
                {it.file && <a className={p.iconBtn} href={it.file}>ملف العقد ↓</a>}
                <button type="button" className={`${p.iconBtn} ${p.danger}`} onClick={async () => {
                  if (it.used > 0) return alert('على العقد مقاعد مخصّصة — حرّرها أولاً أو ألغِ العقد')
                  if (!confirm(`نقل العقد «${it.row.title}» إلى المحذوفات؟`)) return
                  const r = await trash('contract', it.row.id)
                  if (!r.ok) alert(r.error)
                  router.refresh()
                }}>حذف</button>
                <button type="button" className={p.iconBtn} onClick={() => setEdit({ id: it.row.id, fileName: it.row.fileId ? 'مرفق' : '', v: { number: it.row.number, title: it.row.title, status: it.row.status, startsAt: it.row.startsAt, endsAt: it.row.endsAt, seats: it.row.seats, scope: it.row.scope, courseIds: it.row.courseIds, total: it.row.total, fileId: it.row.fileId, notes: it.row.notes } })}>تعديل</button>
              </div>
            </header>
            <div className={`${c.usage} num`}><span className={c.bar}><i style={{ transform: `scaleX(${Math.min(1, it.used / it.row.seats)})` }} /></span>{it.used} / {it.row.seats} مقعد</div>
            {it.seats.length > 0 && (
              <div className={p.scroll}><table className={p.table}>
                <thead><tr><th>المشارك</th><th>الدورة</th><th /></tr></thead>
                <tbody>{it.seats.map((x) => (
                  <tr key={x.id}><td>{x.name}<div className={`${p.muted} ${p.ltr}`}>{x.email}</div></td><td>{x.course}</td>
                    <td><button className={p.iconBtn} onClick={async () => { if (confirm(`تحرير مقعد ${x.email}؟ يُلغى تسجيله ويعود المقعد للعقد.`)) { const r = await releaseContractSeat(x.id); if (!r.ok) setMsg(r.error ?? ''); else router.refresh() } }}>تحرير</button></td></tr>
                ))}</tbody>
              </table></div>
            )}
            {it.state === 'active' && it.used < it.row.seats && (
              seat.contract === it.row.id ? (
                <div className={c.assign}>
                  <Input dir="ltr" placeholder="البريد" value={seat.email} onChange={(e) => setSeat({ ...seat, email: e.target.value })} />
                  <Input placeholder="الاسم" value={seat.name} onChange={(e) => setSeat({ ...seat, name: e.target.value })} />
                  <Select value={seat.courseId} onChange={(courseId) => setSeat({ ...seat, courseId, cohortId: '' })} options={[{ value: '', label: '— الدورة —' }, ...scopeCourses(it).map((x) => ({ value: x.id, label: x.title.replace(/~\d/g, '') }))]} />
                  {(courses.find((x) => x.id === seat.courseId)?.cohorts.length ?? 0) > 0 && (
                    <Select value={seat.cohortId} onChange={(cohortId) => setSeat({ ...seat, cohortId })} options={[{ value: '', label: '— الدفعة —' }, ...courses.find((x) => x.id === seat.courseId)!.cohorts.map((k) => ({ value: k.id, label: k.title }))]} />
                  )}
                  <button className="btn" disabled={!seat.email || !seat.courseId} onClick={() => assign(it)}>خصّص المقعد</button>
                </div>
              ) : <button className="btn ghost" onClick={() => setSeat({ contract: it.row.id, email: '', name: '', courseId: scopeCourses(it).length === 1 ? scopeCourses(it)[0].id : '', cohortId: '' })}>+ تخصيص مقعد</button>
            )}
          </article>
        )
      })}
      {!edit && <button className="btn ghost" onClick={() => setEdit({ id: null, v: BLANK, fileName: '' })}>+ عقد</button>}
      {edit && (
        <div className={c.editor}>
          <Grid>
            <Field label="عنوان العقد" error={errors.title}><Input value={edit.v.title} onChange={(e) => set('title', e.target.value)} placeholder="برنامج تأهيل الإدارة القانونية 2027" /></Field>
            <Field label="رقم العقد"><Input dir="ltr" value={edit.v.number} onChange={(e) => set('number', e.target.value)} /></Field>
          </Grid>
          <Field label="الحالة"><Segmented value={edit.v.status} onChange={(x) => set('status', x)} options={[{ value: 'draft', label: 'مسودة' }, { value: 'active', label: 'ساري' }, { value: 'expired', label: 'منتهٍ' }, { value: 'cancelled', label: 'ملغى' }]} /></Field>
          <Grid cols={3}>
            <Field label="عدد المقاعد" error={errors.seats}><Input type="number" dir="ltr" min={1} value={edit.v.seats} onChange={(e) => set('seats', Number(e.target.value))} /></Field>
            <Field label="البداية"><DateTime value={edit.v.startsAt} onChange={(x) => set('startsAt', x)} /></Field>
            <Field label="النهاية" error={errors.endsAt} hint="نهاية وصول المقاعد"><DateTime value={edit.v.endsAt} onChange={(x) => set('endsAt', x)} /></Field>
          </Grid>
          <Field label="النطاق"><Segmented value={edit.v.scope} onChange={(x) => set('scope', x)} options={[{ value: 'all', label: 'كل الدورات' }, { value: 'courses', label: 'دورات محددة' }]} /></Field>
          {edit.v.scope === 'courses' && <Chips items={courses} on={edit.v.courseIds} toggle={(x) => set('courseIds', edit.v.courseIds.includes(x) ? edit.v.courseIds.filter((y) => y !== x) : [...edit.v.courseIds, x])} error={errors.courseIds} />}
          <Grid>
            <Field label="قيمة العقد (شاملة الضريبة)"><Money value={edit.v.total} onChange={(x) => set('total', x ?? 0)} /></Field>
            <Field label="ملف العقد الموقّع (PDF)" hint={edit.fileName ? `مرفق: ${edit.fileName}` : 'يُحفظ في تخزين خاص'}>
              <input type="file" accept="application/pdf" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </Field>
          </Grid>
          <Field label="ملاحظات داخلية"><Textarea rows={3} value={edit.v.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
          <div className={c.tools}>
            <button className="btn" onClick={save}>حفظ العقد</button>
            <button className="btn ghost" onClick={() => { setEdit(null); setErrors({}); setMsg('') }}>إلغاء</button>
            {edit.id && <History entity="contract" id={edit.id} current={edit.v} onRestore={(x) => setEdit((e) => (e ? { ...e, v: x as ContractInput } : e))} />}
          </div>
        </div>
      )}
    </Section>
  )
}
