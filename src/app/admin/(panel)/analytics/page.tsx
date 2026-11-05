import { requirePermission } from '@/server/auth'
import { dropOff, overview, perCourse } from '@/admin/analytics/data'
import { Bars } from '@/admin/analytics/Bars'
import { PageHead, Section } from '@/admin/ui/kit'
import { sar } from '@/admin/sales/labels'
import p from '@/admin/ui/panel.module.css'
import a from '@/admin/analytics/analytics.module.css'

const RANGES = [[30, '30 يوماً'], [90, '90 يوماً'], [365, 'سنة']] as const
const pctOf = (x: number, n: number) => (n ? `${Math.round((x / n) * 100)}%` : '—')
const dayLabel = (d: string) => new Intl.DateTimeFormat('ar-SA-u-nu-latn-ca-gregory', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`))
const LESSON: Record<string, string> = { video: 'فيديو', article: 'مقال', file: 'ملف', quiz: 'اختبار', live: 'مباشر', onsite: 'حضوري', assignment: 'واجب' }

export default async function Analytics({ searchParams }: { searchParams: Promise<{ r?: string; c?: string }> }) {
  await requirePermission('analytics.read')
  const q = await searchParams
  const range = RANGES.find(([n]) => String(n) === q.r)?.[0] ?? 30
  const [o, courses] = await Promise.all([overview(range), perCourse(range)])
  const pick = courses.find((c) => c.id === q.c) ?? courses.find((c) => c.enrolled > 0) ?? courses[0]
  const drop = pick ? await dropOff(pick.id) : null
  const link = (r: number, c = pick?.id) => `?r=${r}${c ? `&c=${c}` : ''}`
  return (
    <>
      <PageHead title="التحليلات" sub="الزيارات تُعدّ بلا ملفات تعريف ولا هوية، وتحترم «عدم التتبع» في المتصفح" />
      <div className={p.toolbar} role="group" aria-label="المدة">
        <div className={p.chips}>{RANGES.map(([n, l]) => <a key={n} href={link(n)} className={p.chip} aria-current={(range === n) ? 'page' : undefined}>{l}</a>)}</div>
      </div>

      <div className={p.stats}>
        <div className={p.stat}><strong className="num" data-count>{o.kpi.views.toLocaleString('en-US')}</strong><span>زيارة</span></div>
        <div className={p.stat}><strong className="num" data-count>{o.kpi.enrollments}</strong><span>تسجيل جديد</span></div>
        <div className={p.stat}><strong className="num" data-count>{sar(o.kpi.revenue)}</strong><span>صافي الإيراد (ر.س)</span></div>
        <div className={p.stat}><strong className="num" data-count>{o.kpi.completion}%</strong><span>نسبة الإكمال <small className="num">({o.kpi.active} تسجيل فعّال)</small></span></div>
        <div className={p.stat}><strong className="num" data-count>{o.kpi.avgProgress}%</strong><span>متوسط الإنجاز</span></div>
        <div className={p.stat}><strong className="num" data-count>{o.kpi.rating ?? '—'}</strong><span>متوسط التقييم <small className="num">({o.kpi.ratings})</small></span></div>
        <div className={p.stat}><strong className="num" data-count>{o.kpi.certificates}</strong><span>شهادة صادرة</span></div>
      </div>

      <div className={a.charts}>
        <Bars title="الزيارات اليومية" total={o.kpi.views.toLocaleString('en-US')} data={o.series.map((d) => ({ key: d.day, label: dayLabel(d.day), value: d.views, display: d.views.toLocaleString('en-US') }))} />
        <Bars title="التسجيلات اليومية" total={String(o.kpi.enrollments)} data={o.series.map((d) => ({ key: d.day, label: dayLabel(d.day), value: d.enrollments, display: String(d.enrollments) }))} />
        <Bars title="صافي الإيراد اليومي (ر.س)" total={sar(o.kpi.revenue)} data={o.series.map((d) => ({ key: d.day, label: dayLabel(d.day), value: d.revenue, display: sar(d.revenue) }))} />
      </div>

      <Section title="التحويل والإنجاز لكل دورة" desc="زيارة صفحة الدورة ← فتح صفحة التسجيل ← طلب ← دفع، في المدة المختارة. والإنجاز لكل المسجّلين الفعّالين">
        <div className={a.scroll}>
          <div className={p.scroll}><table className={p.table}>
            <thead><tr><th>الدورة</th><th>زيارات</th><th>صفحة التسجيل</th><th>طلبات</th><th>مدفوعة</th><th>التحويل</th><th>مسجّلون</th><th>متوسط الإنجاز</th><th>أكملوا</th><th>شهادات</th><th>التقييم</th></tr></thead>
            <tbody>{courses.map((c) => (
              <tr key={c.id} data-on={pick?.id === c.id ? '1' : '0'}>
                <td><a href={link(range, c.id)}><strong>{c.title}</strong></a></td>
                <td className="num">{c.views}</td>
                <td className="num">{c.checkout}<small className={a.rate}>{pctOf(c.checkout, c.views)}</small></td>
                <td className="num">{c.orders}</td>
                <td className="num">{c.paid}<small className={a.rate}>{pctOf(c.paid, c.orders)}</small></td>
                <td className="num"><strong>{pctOf(c.paid, c.views)}</strong></td>
                <td className="num">{c.enrolled}{c.newEnrolled ? <small className={a.rate}>+{c.newEnrolled}</small> : null}</td>
                <td className="num"><span className={a.meter}><i style={{ transform: `scaleX(${c.avgPct / 100})` }} /></span>{c.avgPct}%</td>
                <td className="num">{c.completed}</td>
                <td className="num">{c.certificates}</td>
                <td className="num">{c.rating !== null ? `${c.rating} ★` : '—'}<small className={a.rate}>{c.ratings || ''}</small></td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      </Section>

      {pick && drop && (
        <Section title={`أين يتوقف المتدربون — ${pick.title}`} desc={`${drop.enrolled} مسجّل فعّال · «توقّف هنا» = آخر درس لمسه من لم يكمل الدورة`}>
          {drop.enrolled === 0 ? <p className={p.muted}>لا مسجّلين بعد.</p> : (
            <ol className={a.drop} role="list">
              {drop.rows.map((r, i) => (
                <li key={r.id}>
                  <span className={`${a.idx} num`}>{i + 1}</span>
                  <span className={a.lname}>{r.title}<small>{LESSON[r.type]}</small></span>
                  <span className={a.track} title={`وصله ${r.reached} · أكمله ${r.done}`}>
                    <i className={a.reach} style={{ transform: `scaleX(${r.reached / drop.enrolled})` }} />
                    <i className={a.done} style={{ transform: `scaleX(${r.done / drop.enrolled})` }} />
                  </span>
                  <span className={`${a.nums} num`}>{r.done} / {drop.enrolled}</span>
                  <span className={`${a.stop} num`} data-on={r.stopped ? '1' : '0'}>{r.stopped ? `توقّف هنا ${r.stopped}` : ''}</span>
                </li>
              ))}
            </ol>
          )}
          <p className={a.legend}><span><i className={a.done} /> أكمله</span><span><i className={a.reach} /> وصله ولم يكمله</span></p>
        </Section>
      )}

      {drop && drop.quizzes.length > 0 && (
        <Section title="الاختبارات" desc="المتوسط ونسبة النجاح لكل المحاولات، وأصعب الأسئلة (الأقل إجابة صحيحة)">
          <div className={a.quizzes}>
            {drop.quizzes.map((qz) => (
              <article key={qz.id} className={a.quiz}>
                <h3>{qz.title}</h3>
                <dl className="num"><div><dt>محاولات</dt><dd>{qz.attempts}</dd></div><div><dt>المتوسط</dt><dd>{qz.avg ?? '—'}{qz.avg !== null && '%'}</dd></div><div><dt>النجاح</dt><dd>{qz.pass ?? '—'}{qz.pass !== null && '%'}</dd></div></dl>
                {qz.attempts > 0 && (
                  <ul role="list">{qz.hardest.map((h) => <li key={h.id}><span>{h.prompt}</span><strong className="num">{h.pct === null ? '—' : `${h.pct}% صحيحة`}</strong></li>)}</ul>
                )}
              </article>
            ))}
          </div>
        </Section>
      )}
    </>
  )
}
