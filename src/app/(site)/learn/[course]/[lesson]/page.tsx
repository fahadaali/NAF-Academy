import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import QRCode from 'qrcode'
import { currentLearner } from '@/server/learner-auth'
import { lessonView } from '@/server/learning'
import { Outline } from '@/site/learn/Outline'
import { VideoWorkspace, Notes, Questions } from '@/site/learn/Workspace'
import { CompleteButton, QuizRunner, AssignmentPanel, JoinPanel } from '@/site/learn/LessonParts'
import { Prose } from '@/components/Prose'
import { formatDay, formatHijri, formatTime } from '@/lib/dates'
import { plain } from '@/motion/kashida'
import st from '@/site/learn/lesson.module.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false } }

const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} م.ب` : `${Math.max(1, Math.round(n / 1024))} ك.ب`)

export default async function LessonPage({ params }: { params: Promise<{ course: string; lesson: string }> }) {
  const { course: slug, lesson: id } = await params
  const me = await currentLearner()
  const v = await lessonView(slug, id, me)
  if (!v) {
    if (!me) redirect(`/login?next=/learn/${slug}/${id}`)
    notFound()
  }
  const { ctx, lesson: l, access, enrolled } = v
  const flat = ctx.modules.flatMap((m) => m.lessons)
  const i = flat.findIndex((x) => x.id === l.id)
  const prev = flat.slice(0, i).reverse().find((x) => x.access.state === 'open')
  const next = flat.slice(i + 1).find((x) => x.access.state === 'open')
  const canAct = enrolled && !!me && access.state === 'open'

  let ticketSvg = ''
  if (v.ticket) {
    const h = await headers()
    const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`
    ticketSvg = (await QRCode.toString(`${origin}/admin/checkin?t=${encodeURIComponent(v.ticket)}`, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }))
      .replace(/fill="#ffffff"/gi, 'fill="transparent"').replace(/#000000/g, 'currentColor')
  }

  return (
    <div className={`wrap ${st.layout}`}>
      <aside className={st.side}>
        <a href={`/learn/${slug}`} className={st.back}>← {plain(ctx.course.title)}</a>
        <div className={st.bar} role="progressbar" aria-valuenow={ctx.pct} aria-valuemin={0} aria-valuemax={100} aria-label="تقدّمك في الدورة"><i style={{ transform: `scaleX(${ctx.pct / 100})` }} /></div>
        <Outline slug={slug} modules={ctx.modules} current={l.id} />
      </aside>

      <main className={st.main}>
        <header className={st.head}>
          <span className="eyebrow">{!enrolled && l.preview ? 'معاينة مجانية' : `الدرس ${i + 1} من ${flat.length}`}</span>
          <h1>{l.title}</h1>
        </header>

        {access.state === 'drip' && <div className={st.locked}><strong>يُفتح هذا الدرس {formatDay(access.opensAt)}</strong><span className="num">{formatTime(access.opensAt)} · {formatHijri(access.opensAt)}</span></div>}
        {access.state === 'sequence' && <div className={st.locked}><strong>أكمل الدروس السابقة أولاً</strong><a className="btn ghost" href={`/learn/${slug}/${access.after}`}>انتقل إلى الدرس المطلوب</a></div>}

        {access.state === 'open' && (
          <div className={st.content}>
            {l.type === 'video' && v.player.kind !== 'none' && v.player.src && (
              <VideoWorkspace slug={slug} lessonId={l.id} kind={v.player.kind} src={v.player.src} resumeAt={v.player.resumeAt} chapters={l.chapters} watermark={me ? me.email || me.phone || me.name : ''} done={v.done} />
            )}
            {l.type === 'video' && v.player.kind === 'none' && <div className={st.locked}><strong>الفيديو قيد التجهيز</strong></div>}

            {l.body && <Prose text={l.body} className={st.prose} />}

            {l.type === 'quiz' && (v.quiz ? (
              <QuizRunner slug={slug} lessonId={l.id} meta={{ passPct: v.quiz.passPct, attempts: v.quiz.attempts, timeLimitMin: v.quiz.timeLimitMin, shuffle: v.quiz.shuffle, showAnswers: v.quiz.showAnswers, used: v.quiz.used, best: v.quiz.best, lastPassed: v.quiz.lastPassed, attemptId: v.quiz.attemptId, count: v.quiz.questions.length }} />
            ) : <div className={st.locked}><strong>الاختبار متاح للمسجّلين</strong></div>)}

            {l.type === 'assignment' && l.assignment && (
              <>
                <section className={st.box}><h2>المطلوب</h2><Prose text={l.assignment.instructions} /></section>
                {canAct && <AssignmentPanel slug={slug} lessonId={l.id} accept={l.assignment.accept} maxMb={l.assignment.maxSizeMb} />}
              </>
            )}

            {l.type === 'live' && (
              <>
                {enrolled ? <JoinPanel lessonId={l.id} startsAt={l.startsAt} opensAt={v.join.state === 'upcoming' ? v.join.opensAt : null} state={v.join.state} />
                  : <div className={st.locked}><strong>رابط الجلسة للمسجّلين فقط</strong></div>}
                {v.recording && (
                  <section className={st.box}>
                    <h2>تسجيل الجلسة</h2>
                    <VideoWorkspace slug={slug} lessonId={l.id} kind={v.recording.kind} src={v.recording.src} resumeAt={0} chapters={[]} watermark={me?.email ?? ''} done={v.done} />
                  </section>
                )}
              </>
            )}

            {l.type === 'onsite' && (
              <div className={st.onsite}>
                <section className={st.box}>
                  <h2>المكان والموعد</h2>
                  {l.startsAt && <p className="num"><strong>{formatDay(l.startsAt)}</strong> · {formatTime(l.startsAt)}{l.endsAt ? ` — ${formatTime(l.endsAt)}` : ''} · {formatHijri(l.startsAt)}</p>}
                  <p>{l.location || [ctx.course.venue, ctx.course.city].filter(Boolean).join('، ')}</p>
                  {ctx.course.venueMapUrl && <a className="btn ghost" href={ctx.course.venueMapUrl} target="_blank" rel="noopener noreferrer">الاتجاهات على الخريطة</a>}
                </section>
                {ticketSvg && (
                  <section className={`${st.box} ${st.ticket}`}>
                    <h2>تذكرة الدخول</h2>
                    <div className={st.qr} dangerouslySetInnerHTML={{ __html: ticketSvg }} role="img" aria-label="رمز QR لتسجيل حضورك" />
                    <p>{v.attended ? '✓ سُجّل حضورك' : 'اعرضها عند الباب ليُسجَّل حضورك'}</p>
                  </section>
                )}
              </div>
            )}

            {l.attachments.length > 0 && (
              <section className={st.box}>
                <h2>المرفقات</h2>
                <ul className={st.files} role="list">
                  {l.attachments.map((a) => <li key={a.assetId}><a href={`/files/${a.assetId}`} download>⇩ {a.name}</a><small className="num">{kb(a.size)}</small></li>)}
                </ul>
              </section>
            )}

            {canAct && (l.type === 'article' || l.type === 'file') && <CompleteButton slug={slug} lessonId={l.id} done={v.done} />}

            {!enrolled && <div className={st.locked}><strong>أعجبك؟ سجّل لتكمل الدورة كاملة</strong><a className="btn" href={`/courses/${slug}`}>التسجيل</a></div>}

            {canAct && l.type === 'video' && <Questions slug={slug} lessonId={l.id} />}
            {canAct && l.type !== 'video' && (
              <div className={st.extras}><Notes slug={slug} lessonId={l.id} /><Questions slug={slug} lessonId={l.id} /></div>
            )}
          </div>
        )}

        <nav className={st.pager} aria-label="التنقل بين الدروس">
          {prev ? <a href={`/learn/${slug}/${prev.id}`}>→ {prev.title}</a> : <span />}
          {next ? <a href={`/learn/${slug}/${next.id}`}>{next.title} ←</a> : <span />}
        </nav>
      </main>
    </div>
  )
}
