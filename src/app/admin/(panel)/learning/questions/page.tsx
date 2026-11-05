import { questionsQueue } from '@/admin/learning/data'
import { AnswerBox } from '@/admin/learning/Review'
import { PageHead } from '@/admin/ui/kit'
import { when } from '@/admin/sales/labels'
import p from '@/admin/ui/panel.module.css'
import r from '@/admin/learning/review.module.css'

export default async function Questions({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const done = (await searchParams).done === '1'
  const rows = await questionsQueue(!done)
  return (
    <>
      <PageHead title="أسئلة المتدربين" sub="ما يُكتب تحت الدروس — الإجابة تظهر للسائل تحت الدرس" actions={<a className="btn ghost" href="/admin/learning">الواجبات</a>} />
      <div className={p.toolbar}><div className={p.chips}>
        <a href="?" className={p.chip} aria-pressed={!done}>بلا إجابة</a>
        <a href="?done=1" className={p.chip} aria-pressed={done}>أُجيب عنها</a>
      </div></div>
      {rows.length === 0 ? <div className={p.empty}>{done ? 'لا إجابات بعد.' : 'لا أسئلة معلّقة.'}</div> : (
        <div className={r.list}>
          {rows.map(({ q, learner, email, lesson, course }) => (
            <article key={q.id} className={r.card}>
              <div className={r.head}>
                <div><strong>{learner || email}</strong><div className={r.meta}>{course} · {lesson}</div></div>
                <span className={`${r.meta} num`}>{when(q.createdAt)}</span>
              </div>
              <p className={r.body}>{q.body}</p>
              {q.answeredBy && <div className={r.prev}>أجاب {q.answeredBy} · <span className="num">{when(q.answeredAt)}</span></div>}
              <AnswerBox id={q.id} answer={q.answer ?? ''} />
            </article>
          ))}
        </div>
      )}
    </>
  )
}
