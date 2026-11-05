import { submissionsQueue, learningCounts } from '@/admin/learning/data'
import { SubmissionReview } from '@/admin/learning/Review'
import { Badge, PageHead } from '@/admin/ui/kit'
import { when } from '@/admin/sales/labels'
import p from '@/admin/ui/panel.module.css'
import r from '@/admin/learning/review.module.css'

const F = [['submitted', 'بانتظار المراجعة'], ['revise', 'طُلب تعديلها'], ['accepted', 'مقبولة'], ['all', 'الكل']] as const
const TONE: Record<string, string> = { submitted: 'soon', revise: 'full', accepted: 'open' }
const LABEL: Record<string, string> = { submitted: 'بانتظار المراجعة', revise: 'طُلب تعديل', accepted: 'مقبول' }

export default async function Submissions({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const q = (await searchParams).s
  const status = (F.find(([k]) => k === q)?.[0] ?? 'submitted') as (typeof F)[number][0]
  const [rows, n] = await Promise.all([submissionsQueue(status), learningCounts()])
  return (
    <>
      <PageHead title="الواجبات" sub={`${n.submissions} بانتظار المراجعة · ${n.questions} سؤالاً بلا إجابة`} actions={<a className="btn ghost" href="/admin/learning/questions">أسئلة المتدربين</a>} />
      <div className={p.toolbar}><div className={p.chips}>{F.map(([k, l]) => <a key={k} href={`?s=${k}`} className={p.chip} aria-pressed={status === k}>{l}</a>)}</div></div>
      {rows.length === 0 ? <div className={p.empty}>لا تسليمات هنا.</div> : (
        <div className={r.list}>
          {rows.map(({ sub, learner, lesson, course, file }) => (
            <article key={sub.id} className={r.card}>
              <div className={r.head}>
                <div><strong>{learner.name || learner.email}</strong><div className={r.meta}>{course} · {lesson}</div></div>
                <div style={{ display: 'grid', justifyItems: 'end', gap: 4 }}><Badge tone={TONE[sub.status]}>{LABEL[sub.status]}</Badge><span className={`${r.meta} num`}>{when(sub.createdAt)}</span></div>
              </div>
              {sub.assetId && <a className={r.file} href={`/admin/files/${sub.assetId}`}>⇩ {file ?? 'الملف'}</a>}
              {sub.note && <p className={r.body}>{sub.note}</p>}
              {sub.reviewedBy && <div className={r.prev}>راجعه {sub.reviewedBy} · <span className="num">{when(sub.reviewedAt)}</span></div>}
              <SubmissionReview id={sub.id} status={sub.status} feedback={sub.feedback} />
            </article>
          ))}
        </div>
      )}
    </>
  )
}
