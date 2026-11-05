'use client'
/* مساحة الدرس: المشغّل ومعه الفصول والملاحظات بختم زمني والأسئلة — يتشاركون موضع التشغيل. */
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Chapter } from '@/lib/learning-types'
import { addNote, askQuestion, deleteNote, listNotes, listQuestions, saveProgress } from '@/site/learn-actions'
import { Player, formatTime, type PlayerApi } from './Player'
import w from './workspace.module.css'

type Note = { id: string; body: string; atSec: number | null }
type Q = { id: string; body: string; answer: string | null; mine: boolean }

export function VideoWorkspace(p: { slug: string; lessonId: string; kind: 'stream' | 'url'; src: string; resumeAt: number; chapters: Chapter[]; watermark: string; done: boolean; captions?: { src: string; lang: string; label: string }[] }) {
  const router = useRouter()
  const api = useRef<PlayerApi>(null)
  const [theater, setTheater] = useState(false)
  const [done, setDone] = useState(p.done)
  const onBeat = useCallback((pos: number, delta: number, dur: number) => {
    saveProgress(p.slug, p.lessonId, pos, delta, dur).then((r) => { if (r.done && !done) { setDone(true); router.refresh() } }).catch(() => {})
  }, [p.slug, p.lessonId, done, router])
  return (
    <div className={w.video} data-theater={theater ? '1' : '0'}>
      <Player ref={api} kind={p.kind} src={p.src} resumeAt={p.resumeAt} chapters={p.chapters} captions={p.captions ?? []} watermark={p.watermark} onBeat={onBeat} theater={theater} onTheater={setTheater} />
      {done && <p className={w.done} role="status">✓ اكتمل هذا الدرس</p>}
      <div className={w.side}>
        {p.chapters.length > 0 && (
          <section className={w.panel}>
            <h2>الفصول</h2>
            <ol role="list" className={w.chapters}>
              {p.chapters.map((c) => <li key={c.at}><button onClick={() => api.current?.seek(c.at)}><span className="num">{formatTime(c.at)}</span>{c.title}</button></li>)}
            </ol>
          </section>
        )}
        <Notes slug={p.slug} lessonId={p.lessonId} api={api} />
      </div>
    </div>
  )
}

export function Notes({ slug, lessonId, api }: { slug: string; lessonId: string; api?: React.RefObject<PlayerApi | null> }) {
  const [list, setList] = useState<Note[]>([])
  const [text, setText] = useState('')
  const [, start] = useTransition()
  const load = useCallback(() => listNotes(slug, lessonId).then(setList).catch(() => {}), [slug, lessonId])
  useEffect(() => { load() }, [load])
  return (
    <section className={w.panel}>
      <h2>ملاحظاتي</h2>
      <div className={w.compose}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={api ? 'اكتب ملاحظة — تُحفظ عند الدقيقة الحالية' : 'اكتب ملاحظة'} rows={2} aria-label="ملاحظة جديدة"
          onFocus={() => api?.current?.pause()} />
        <button className="btn" disabled={!text.trim()} onClick={() => {
          const at = api?.current ? Math.floor(api.current.time()) : null
          start(async () => { await addNote(slug, lessonId, text, at); setText(''); load() })
        }}>حفظ</button>
      </div>
      {list.length === 0 ? <p className={w.muted}>لا ملاحظات بعد.</p> : (
        <ul role="list" className={w.notes}>
          {list.map((n) => (
            <li key={n.id}>
              {n.atSec !== null && api ? <button className={`${w.stamp} num`} onClick={() => api.current?.seek(n.atSec!)}>{formatTime(n.atSec)}</button> : null}
              <span>{n.body}</span>
              <button className={w.x} aria-label="حذف الملاحظة" onClick={() => start(async () => { await deleteNote(slug, lessonId, n.id); load() })}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function Questions({ slug, lessonId }: { slug: string; lessonId: string }) {
  const [list, setList] = useState<Q[]>([])
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  const load = useCallback(() => listQuestions(slug, lessonId).then(setList).catch(() => {}), [slug, lessonId])
  useEffect(() => { load() }, [load])
  return (
    <section className={w.panel}>
      <h2>أسئلة حول الدرس</h2>
      <div className={w.compose}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="اسأل المدرب — يصلك الجواب هنا" rows={2} aria-label="سؤال جديد" />
        <button className="btn ghost" disabled={text.trim().length < 5} onClick={async () => {
          const r = await askQuestion(slug, lessonId, text)
          if (r.ok) { setText(''); setMsg('أُرسل سؤالك'); load() } else setMsg(r.error ?? '')
        }}>اسأل</button>
      </div>
      {msg && <p className={w.muted} role="status">{msg}</p>}
      <ul role="list" className={w.qa}>
        {list.map((q) => (
          <li key={q.id}>
            <p><strong>{q.mine ? 'سؤالك' : 'سؤال'}:</strong> {q.body}</p>
            {q.answer ? <p className={w.answer}><strong>الجواب:</strong> {q.answer}</p> : <p className={w.muted}>بانتظار الجواب</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}
