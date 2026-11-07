'use client'
/* إضافة مشاركين إلى دورة: لصق قائمة أو رفع CSV ← معاينة بأخطاء كل سطر ← تسجيل مباشر أو دعوة بالبريد،
   على دفعات من 25 صفاً، ثم جدول النتائج وتصديره (ومعه روابط الدعوات إن لم يُرسل البريد). */
import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Field, PageHead, Section, Segmented, Select, Textarea } from '@/admin/ui/kit'
import p from '@/admin/ui/panel.module.css'
import { downloadCsv } from '@/admin/ui/csv'
import { parseRoster, ROSTER_BATCH, ROSTER_MAX } from '@/lib/roster'
import { INVITE_DAYS } from '@/lib/invites'
import { bulkEnroll, bulkInvite } from './actions'

type Mode = 'invite' | 'enroll'
type Result = { email: string; label: string; ok: boolean; link?: string }

const ENROLL_LABEL = { enrolled: 'سُجّل', renewed: 'جُدّد وصوله', already: 'مسجّل من قبل', error: 'تعذّر' } as const
const INVITE_LABEL = { invited: 'دُعي', 'enrolled-before': 'مسجّل من قبل', 'invited-before': 'له دعوة مفتوحة' } as const

export function AddParticipants({ courseId, title, cohorts, mailOpen, room }: {
  courseId: string; title: string; cohorts: { id: string; title: string; room: number | null }[] | null; mailOpen: boolean; room: number | null
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('invite')
  const [cohortId, setCohortId] = useState(cohorts?.[0]?.id ?? '')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const file = useRef<HTMLInputElement>(null)
  const parsed = useMemo(() => parseRoster(text), [text])
  const valid = parsed.rows.filter((r) => !r.error)
  const bad = parsed.rows.length - valid.length
  const left = cohorts ? cohorts.find((k) => k.id === cohortId)?.room ?? null : room

  const run = async () => {
    setError(''); setResults([])
    const out: Result[] = []
    for (let i = 0; i < valid.length; i += ROSTER_BATCH) {
      setBusy(`جارٍ المعالجة… ${Math.min(i + ROSTER_BATCH, valid.length)} من ${valid.length}`)
      const chunk = valid.slice(i, i + ROSTER_BATCH).map(({ email, name, phone }) => ({ email, name, phone }))
      if (mode === 'enroll') {
        const r = await bulkEnroll(courseId, cohorts ? cohortId : null, chunk)
        if (!r.ok) { setError(r.error); break }
        out.push(...r.results.map((x) => ({ email: x.email, label: x.error ? `${ENROLL_LABEL[x.status]}: ${x.error}` : ENROLL_LABEL[x.status], ok: x.status !== 'error' })))
      } else {
        const r = await bulkInvite(courseId, cohorts ? cohortId : null, chunk)
        if (!r.ok) { setError(r.error); break }
        out.push(...r.results.map((x) => ({ email: x.email, label: x.status === 'invited' ? (x.mailed ? 'دُعي وأُرسل البريد' : 'دُعي — انسخ الرابط وأرسله') : INVITE_LABEL[x.status], ok: true, link: x.mailed ? undefined : x.link })))
      }
      setResults([...out])
    }
    setBusy('')
    if (out.length) { setText(''); router.refresh() }
  }

  const links = results.filter((r) => r.link)
  return (
    <>
      <PageHead title="إضافة مشاركين" sub={title.replace(/~\d?/g, '')}
        actions={<Link className="btn ghost" href={`/admin/courses/${courseId}/learners`}>العودة إلى المسجّلين</Link>} />

      <Section title="الطريقة">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'invite', label: 'دعوة بالبريد' }, { value: 'enroll', label: 'تسجيل مباشر' }]} />
        <p className={p.muted}>
          {mode === 'invite'
            ? `يصل كل مشارك رابط يكمل منه اسمه (كما في الشهادة) وجواله فيُسجَّل ويدخل مباشرة. الرابط لمرة واحدة وصالح ${INVITE_DAYS} يوماً، والدعوة تحجز مقعدها حتى تُقبل أو تُلغى أو تنتهي.`
            : 'يُسجَّل المشارك فوراً بلا طلب ولا دفع (مصدره «منحة»)، ويصله بريد الترحيب، ويدخل لاحقاً ببريده برمز التحقق. الاسم يُكتب في الشهادة كما هو هنا.'}
        </p>
        {mode === 'invite' && !mailOpen && <p className={p.alert} role="note">قناة البريد غير مفعّلة — ستُنشأ الدعوات وتظهر روابطها هنا لتنسخها أو تصدّرها وترسلها بنفسك.</p>}
        {cohorts && (cohorts.length
          ? <Field label="الدفعة" hint={left !== null ? `المتبقي: ${left} مقعد` : 'بلا حد للمقاعد'}><Select value={cohortId} onChange={setCohortId} options={cohorts.map((k) => ({ value: k.id, label: k.title }))} /></Field>
          : <p className={p.alert}>كل دفعات هذه الدورة مغلقة أو منتهية — افتح دفعة من محرّر الدورة أولاً.</p>)}
        {!cohorts && left !== null && <p className={p.muted}>المتبقي في الدورة: <span className="num">{left}</span> مقعد</p>}
      </Section>

      <Section title="القائمة" desc={`سطر لكل مشارك: البريد (شرط) والاسم والجوال — بأي ترتيب، مفصولة بفاصلة أو منسوخة من جدول Excel. حتى ${ROSTER_MAX} مشارك.`}>
        <Field label="ألصق القائمة" wide>
          <Textarea dir="auto" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'الاسم,البريد,الجوال\nسارة العتيبي,sara@uni.edu.sa,0551234567'} />
        </Field>
        <div>
          <input ref={file} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setText(await f.text()) }} />
          <button type="button" className="btn ghost" onClick={() => file.current?.click()}>رفع ملف CSV</button>
        </div>
      </Section>

      {parsed.rows.length > 0 && (
        <Section title="المعاينة" desc={`${valid.length} صالح${bad ? ` · ${bad} بحاجة لتصحيح (لن يُرسل)` : ''}${parsed.truncated ? ` · اقتُصر على أول ${ROSTER_MAX}` : ''}`}>
          <div className={p.scroll}><table className={p.table}>
            <thead><tr><th>السطر</th><th>الاسم</th><th>البريد</th><th>الجوال</th><th>الحالة</th></tr></thead>
            <tbody>{parsed.rows.map((r) => (
              <tr key={r.line}>
                <td className="num">{r.line}</td>
                <td>{r.name || <span className={p.muted}>{mode === 'invite' ? 'يكمله المشارك' : 'بلا اسم'}</span>}</td>
                <td className={p.ltr}>{r.email}</td>
                <td className={p.ltr}>{r.phone}</td>
                <td>{r.error ? <strong role="note" className={p.err}>{r.error}</strong> : '✓'}</td>
              </tr>
            ))}</tbody>
          </table></div>
          {error && <p className={p.alert} role="alert">{error}</p>}
          <div>
            <button type="button" className="btn" disabled={!!busy || !valid.length || (!!cohorts && !cohortId)} onClick={run}>
              {busy || (mode === 'invite' ? `إرسال ${valid.length} دعوة` : `تسجيل ${valid.length} مشارك`)}
            </button>
          </div>
        </Section>
      )}

      {busy && !parsed.rows.length && <p role="status" className={p.muted}>{busy}</p>}
      {error && !parsed.rows.length && <p className={p.alert} role="alert">{error}</p>}

      {results.length > 0 && (
        <Section title="النتيجة" desc={`${results.filter((r) => r.ok).length} من ${results.length}`}>
          <div className={p.scroll}><table className={p.table}>
            <thead><tr><th>البريد</th><th>النتيجة</th>{links.length > 0 && <th>رابط الدعوة</th>}</tr></thead>
            <tbody>{results.map((r) => (
              <tr key={r.email}>
                <td className={p.ltr}>{r.email}</td>
                <td>{r.ok ? r.label : <strong className={p.err}>{r.label}</strong>}</td>
                {links.length > 0 && <td>{r.link && <button type="button" className="btn ghost" onClick={() => navigator.clipboard?.writeText(r.link!)}>نسخ الرابط</button>}</td>}
              </tr>
            ))}</tbody>
          </table></div>
          <div>
            <button type="button" className="btn ghost" onClick={() => downloadCsv('participants.csv', [['البريد', 'النتيجة', 'رابط الدعوة'], ...results.map((r) => [r.email, r.label, r.link ?? ''])])}>
              تصدير النتيجة{links.length ? ' مع الروابط' : ''}
            </button>
          </div>
        </Section>
      )}
    </>
  )
}
