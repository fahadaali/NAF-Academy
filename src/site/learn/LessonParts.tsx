'use client'
/* أجزاء الدروس التفاعلية: الاختبار، والواجب، والجلسة المباشرة، وزر الإكمال. */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PublicQuiz } from '@/lib/learning-types'
import { markComplete, mySubmissions, quizQuestions, startQuiz, submitAssignment, submitQuiz } from '@/site/learn-actions'
import { Words } from '@/components/Words'
import s from './parts.module.css'

export function CompleteButton({ slug, lessonId, done }: { slug: string; lessonId: string; done: boolean }) {
  const router = useRouter()
  const [ok, setOk] = useState(done)
  return ok ? <p className={s.done}>✓ أكملت هذا الدرس</p> : (
    <button className="btn" onClick={async () => { const r = await markComplete(slug, lessonId); if (r.ok) { setOk(true); router.refresh() } }}>أكملت هذا الدرس</button>
  )
}

type Results = Record<string, { correct: boolean; right: string[]; explanation?: string }>

export function QuizRunner({ slug, lessonId, meta }: { slug: string; lessonId: string; meta: Omit<PublicQuiz, 'questions'> & { used: number; best: number | null; lastPassed: boolean | null; attemptId: string; count: number } }) {
  const router = useRouter()
  const [quiz, setQuiz] = useState<PublicQuiz | null>(null)
  const [answers, setAnswers] = useState<Record<string, string[]>>({})
  const [started, setStarted] = useState<string | null>(null)
  const [left, setLeft] = useState<number | null>(null)
  const [result, setResult] = useState<{ scorePct: number; passed: boolean; results: Results; late: boolean } | null>(null)
  const [err, setErr] = useState('')
  const attemptsLeft = meta.attempts === null ? null : meta.attempts - meta.used

  const begin = async () => {
    setErr('')
    const r = await startQuiz(slug, lessonId)
    if (!r.ok) return setErr(r.error ?? '')
    setQuiz(await quizQuestions(slug, lessonId))
    setStarted(r.startedAt!)
  }
  useEffect(() => { if (meta.attemptId) void begin() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!started || !meta.timeLimitMin) return
    const end = Date.parse(started) + meta.timeLimitMin * 60e3
    const id = setInterval(() => setLeft(Math.max(0, Math.round((end - Date.now()) / 1000))), 1000)
    return () => clearInterval(id)
  }, [started, meta.timeLimitMin])

  const pick = (qid: string, oid: string, multi: boolean) => setAnswers((a) => ({ ...a, [qid]: multi ? (a[qid]?.includes(oid) ? a[qid].filter((x) => x !== oid) : [...(a[qid] ?? []), oid]) : [oid] }))
  const submit = async () => {
    const r = await submitQuiz(slug, lessonId, answers)
    if (!r.ok) return setErr(r.error)
    setResult({ scorePct: r.scorePct, passed: r.passed, results: r.results, late: r.late })
    router.refresh()
  }

  if (result) return (
    <div className={s.card}>
      <div className={s.score} data-pass={result.passed ? '1' : '0'}>
        <span className="num">{result.scorePct}%</span>
        <Words as="strong" text={result.passed ? 'اجت~4زت الاختبار.' : 'لم تبلغ درجة النجاح.'} />
        <em>درجة النجاح {meta.passPct}%{result.late ? ' — سُلّم بعد انتهاء الوقت' : ''}</em>
      </div>
      {quiz && quiz.questions.map((q, i) => {
        const r = result.results[q.id]
        return (
          <div key={q.id} className={s.q} data-ok={r?.correct ? '1' : '0'}>
            <p><b className="num">{i + 1}.</b> {q.prompt} <span className={s.mark}>{r?.correct ? '✓ صحيحة' : '✕ خاطئة'}</span></p>
            {r && r.right.length > 0 && <p className={s.right}>الصحيح: {q.options.filter((o) => r.right.includes(o.id)).map((o) => o.text).join('، ')}</p>}
            {r?.explanation && <p className={s.explain}>{r.explanation}</p>}
          </div>
        )
      })}
      {!result.passed && (attemptsLeft === null || attemptsLeft - 1 > 0) && <button className="btn" onClick={() => { setResult(null); setAnswers({}); setQuiz(null); setStarted(null) }}>محاولة جديدة</button>}
    </div>
  )

  if (!quiz) return (
    <div className={s.card}>
      <h2 className={s.h2}>الاختبار</h2>
      <dl className={`${s.facts} num`}>
        <div><dt>الأسئلة</dt><dd>{meta.count}</dd></div>
        <div><dt>النجاح</dt><dd>{meta.passPct}%</dd></div>
        <div><dt>الوقت</dt><dd>{meta.timeLimitMin ? `${meta.timeLimitMin} دقيقة` : 'مفتوح'}</dd></div>
        <div><dt>المحاولات</dt><dd>{attemptsLeft === null ? 'غير محدودة' : `بقي ${attemptsLeft}`}</dd></div>
        {meta.best !== null && <div><dt>أفضل نتيجة</dt><dd>{meta.best}%</dd></div>}
      </dl>
      {meta.lastPassed ? <p className={s.done}>✓ اجتزت هذا الاختبار</p>
        : attemptsLeft === 0 ? <p className={s.err}>استنفدت المحاولات — تواصل مع المدرب</p>
        : <button className="btn" onClick={begin}>ابدأ الاختبار</button>}
      {err && <p className={s.err}>{err}</p>}
    </div>
  )

  const answered = quiz.questions.filter((q) => answers[q.id]?.length).length
  return (
    <div className={s.card}>
      <div className={s.qbar}>
        <span className="num">أُجيب {answered} من {quiz.questions.length}</span>
        {left !== null && <span className={`num ${s.clock}`} data-low={left < 60 ? '1' : '0'}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>}
      </div>
      {quiz.questions.map((q, i) => (
        <fieldset key={q.id} className={s.q}>
          <legend><b className="num">{i + 1}.</b> {q.prompt}{q.kind === 'multi' && <span className={s.hint}> — اختر كل ما ينطبق</span>}</legend>
          {q.caseText && <blockquote className={s.case}>{q.caseText}</blockquote>}
          <div className={s.opts}>
            {q.options.map((o) => {
              const on = answers[q.id]?.includes(o.id) ?? false
              return (
                <label key={o.id} className={s.opt} data-on={on ? '1' : '0'}>
                  <input type={q.kind === 'multi' ? 'checkbox' : 'radio'} name={q.id} checked={on} onChange={() => pick(q.id, o.id, q.kind === 'multi')} />
                  <span>{o.text}</span>
                </label>
              )
            })}
          </div>
        </fieldset>
      ))}
      {err && <p className={s.err}>{err}</p>}
      <button className="btn" disabled={answered === 0} onClick={() => (answered < quiz.questions.length ? confirm('لم تُجب عن كل الأسئلة. تسليم الآن؟') : true) && submit()}>سلّم الإجابات</button>
    </div>
  )
}

type Sub = { sub: { id: string; status: 'submitted' | 'accepted' | 'revise'; feedback: string; createdAt: string; note: string }; name: string | null }
const SUB_LABEL = { submitted: 'بانتظار المراجعة', accepted: 'مقبول ✓', revise: 'يحتاج تعديلاً' }

export function AssignmentPanel({ slug, lessonId, accept, maxMb }: { slug: string; lessonId: string; accept: string[]; maxMb: number }) {
  const router = useRouter()
  const [subs, setSubs] = useState<Sub[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const load = () => mySubmissions(slug, lessonId).then(setSubs).catch(() => {})
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const accepted = subs.some((x) => x.sub.status === 'accepted')
  return (
    <div className={s.card}>
      {!accepted && (
        <form className={s.upload} onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true); setErr('')
          const fd = new FormData(e.currentTarget)
          fd.set('slug', slug); fd.set('lessonId', lessonId)
          const r = await submitAssignment(fd)
          setBusy(false)
          if (!r.ok) return setErr(r.error ?? '')
          ;(e.target as HTMLFormElement).reset()
          load(); router.refresh()
        }}>
          <label className={s.drop}>
            <input type="file" name="file" required accept={accept.map((x) => `.${x}`).join(',')} />
            <span>اختر ملف الواجب <em>({accept.map((x, i) => <span key={x}>{i ? '، ' : ''}<bdi>{x}</bdi></span>)} — حتى {maxMb} م.ب)</em></span>
          </label>
          <textarea name="note" rows={2} placeholder="ملاحظة للمدرب (اختياري)" className={s.note} />
          {err && <p className={s.err}>{err}</p>}
          <button className="btn" disabled={busy}>{busy ? 'جارٍ الرفع…' : 'سلّم الواجب'}</button>
        </form>
      )}
      {subs.length > 0 && (
        <ul role="list" className={s.subs}>
          {subs.map((x) => (
            <li key={x.sub.id} data-status={x.sub.status}>
              <strong>{SUB_LABEL[x.sub.status]}</strong> <span className="num">{new Date(x.sub.createdAt).toLocaleDateString('ar-SA-u-nu-latn', { timeZone: 'Asia/Riyadh' })}</span> · {x.name}
              {x.sub.feedback && <p className={s.explain}>ملاحظة المدرب: {x.sub.feedback}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** `compact`: سطر واحد في بطاقة «دوراتي» — العدّ التنازلي ثم «انضم الآن» في الموعد */
export function JoinPanel({ lessonId, startsAt, opensAt, state: initial, compact, title }: { lessonId: string; startsAt: string | null; opensAt: string | null; state: 'upcoming' | 'open' | 'ended' | 'unscheduled'; compact?: boolean; title?: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])
  const state = initial === 'upcoming' && opensAt && now >= Date.parse(opensAt) ? 'open' : initial
  const left = startsAt ? Math.max(0, Date.parse(startsAt) - now) : 0
  const d = Math.floor(left / 864e5), h = Math.floor((left % 864e5) / 36e5), m = Math.floor((left % 36e5) / 6e4), sec = Math.floor((left % 6e4) / 1000)
  if (compact) return (
    <div className={s.joinLine} data-state={state}>
      <span>{title && <strong>{title}</strong>}
        {state === 'upcoming' && <small className="num">بعد {d > 0 ? `${d} يوم · ` : ''}{h} ساعة · {m} دقيقة · {sec} ثانية</small>}
        {state === 'open' && <small>الجلسة مفتوحة الآن</small>}
      </span>
      {state === 'open' ? <a className={`btn ${s.joinNow}`} href={`/learn-go/${lessonId}`}>انضم الآن</a> : <span className={s.joinSoon}>الانضمام قبل الموعد بربع ساعة</span>}
    </div>
  )
  return (
    <div className={s.card}>
      {state === 'upcoming' && (
        <>
          <p className={s.hint}>تبدأ الجلسة بعد</p>
          <div className={`${s.countdown} num`} aria-live="off">
            {d > 0 && <span><b>{d}</b>يوم</span>}<span><b>{h}</b>ساعة</span><span><b>{m}</b>دقيقة</span><span><b>{sec}</b>ثانية</span>
          </div>
          <button className="btn" aria-disabled="true" disabled>يُفعَّل الانضمام قبل الموعد بربع ساعة</button>
        </>
      )}
      {state === 'open' && <a className={`btn ${s.joinNow}`} href={`/learn-go/${lessonId}`}>انضم الآن</a>}
      {state === 'ended' && <p className={s.hint}>انتهت الجلسة.</p>}
      {state === 'unscheduled' && <p className={s.hint}>يُعلن موعد الجلسة قريباً.</p>}
    </div>
  )
}
