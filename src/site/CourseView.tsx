/* صفحة الدورة — مشهد افتتاحي، وبطاقة سعر ثابتة، ونتائج، ومنهج، ومكان، ومدربون، وأسئلة. */
import type { CourseDetail } from '@/server/queries'
import { Words } from '@/components/Words'
import { PriceTag } from '@/components/PriceTag'
import { Picture } from '@/components/Picture'
import { CourseCard } from '@/components/CourseCard'
import { Prose } from '@/components/Prose'
import { Blocks } from '@/components/Blocks'
import { Riyal } from '@/components/Riyal'
import { CouponBanner } from './CouponBanner'
import { Teaser } from './Teaser'
import { formatAmount } from '@/lib/pricing'
import { mergeRules } from '@/lib/certificate'
import { levelLabel, modeLabel, statusView } from '@/lib/course-meta'
import { formatDay, formatHijri, formatTime, formatWeekday } from '@/lib/dates'
import s from './course.module.css'

function Stars({ value }: { value: number }) {
  return <span className={s.stars} role="img" aria-label={`${value} من 5`}><span style={{ inlineSize: `${(value / 5) * 100}%` }}>★★★★★</span>★★★★★</span>
}

const LESSON: Record<string, string> = { video: 'فيديو', article: 'مقال', file: 'ملف', quiz: 'اختبار', live: 'مباشر', onsite: 'حضوري', assignment: 'واجب' }

/** `corporate`: مشهد «للمؤسسات» ظاهر في الرئيسية (وإلا فرابطه ميت) · `vat`: نسبة الضريبة المئوية لإيضاح أن السعر شامل */
export function CourseView({ data, preview, corporate = true, vat = 0 }: { data: CourseDetail; preview?: boolean; corporate?: boolean; vat?: number }) {
  const { course: c, row, track, instructors, curriculum, related, tiers, groupRules } = data
  const fromPrice = tiers.length ? Math.min(...tiers.map((t) => t.price)) : null
  const st = statusView[c.status] ?? { label: 'مسودة', cta: 'معاينة فقط', dim: false, tone: 'soon' as const }
  const lessons = curriculum.reduce((a, m) => a + m.lessons.length, 0)
  const minutes = curriculum.reduce((a, m) => a + m.lessons.reduce((b, l) => b + l.minutes, 0), 0)
  const left = c.seats ? c.seats.total - c.seats.taken : undefined
  const enroll = `/courses/${c.slug}/enroll`
  const hasLive = curriculum.some((m) => m.lessons.some((l) => l.type === 'live'))
  /* خصم المجموعة: أعلى نسبة بعدد مقاعدها هي، وأول عتبة يبدأ عندها */
  const bestRule = groupRules.reduce<(typeof groupRules)[number] | null>((b, g) => (!b || g.percent > b.percent ? g : b), null)
  const firstRule = groupRules[0]
  const isFree = fromPrice === null && (c.pricing.free || c.pricing.amount <= 0)
  const cohorts = c.cohorts ?? []
  const COHORT_LABEL = { open: 'التسجيل مفتوح', full: 'اكتمل العدد', soon: 'قريباً', closed: 'انتهى التسجيل' } as const

  return (
    <article className={s.page} data-status={st.tone}>
      {preview && <div className={s.previewBar}>معاينة — الحالة الحالية لا تُظهر الدورة للعموم</div>}
      <CouponBanner slug={c.slug} />

      <header className={s.hero} data-surface="night">
        {c.cover && <div className={s.heroImg} data-vt-hero><Picture media={c.cover} priority /></div>}
        <div className={s.heroShade} aria-hidden="true" />
        <div className={`wrap ${s.heroInner}`}>
          <nav className={s.crumbs} aria-label="المسار">
            <a href="/courses">الدورات</a>
            {track && <><span aria-hidden="true">/</span><a href={`/tracks/${track.slug}`}>{track.title}</a></>}
          </nav>
          <div className={s.chips}>
            <span>{modeLabel[c.mode]}</span><span>درجة {levelLabel[c.level]}</span>
            <span className={s.state} data-tone={st.tone}>{st.label}</span>
          </div>
          <Words as="h1" text={c.title} className={s.title} />
          {c.subtitle && <p className={`reveal ${s.subtitle}`} style={{ ['--d' as string]: 2 }}>{c.subtitle}</p>}
          {row.teaser.provider !== 'none' && <Teaser slug={c.slug} kind={row.teaser.provider} label="شاهد التعريف بالدورة" token={preview ? row.previewToken : undefined} />}
          <dl className={`reveal num ${s.facts}`} style={{ ['--d' as string]: 3 }}>
            {c.startsAt ? (
              <div><dt>يبدأ</dt><dd>{formatWeekday(c.startsAt)} {formatDay(c.startsAt)}<small>{formatHijri(c.startsAt)} · {formatTime(c.startsAt)}</small></dd></div>
            ) : <div><dt>البدء</dt><dd>متى شئت<small>تعلّم ذاتي</small></dd></div>}
            <div><dt>المدة</dt><dd>{c.hours} ساعة<small>{lessons} درساً</small></dd></div>
            {c.city && <div><dt>المكان</dt><dd>{c.city}<small>حضوري</small></dd></div>}
            <div><dt>الوصول</dt><dd>{c.accessDays ? `${c.accessDays} يوماً` : 'دائم'}<small>{c.accessDays ? (c.cohorts?.length ? 'بعد نهاية الدفعة' : 'من التسجيل') : 'للمحتوى والتسجيلات'}</small></dd></div>
            {left !== undefined && c.status !== 'closed' && <div><dt>المقاعد</dt><dd>{left > 0 ? `بقي ${left}` : 'مكتملة'}<small>من {c.seats!.total}</small></dd></div>}
          </dl>
        </div>
      </header>

      <div className={`wrap ${s.body}`}>
        <div className={s.main}>
          {row.outcomes.length > 0 && (
            <section className={s.block}>
              <h2 className={s.h2}>ستتمكّن من</h2>
              <ul role="list" className={s.outcomes}>
                {row.outcomes.map((o, i) => <li key={i} className="reveal" style={{ ['--d' as string]: i }}><span className="num">{String(i + 1).padStart(2, '0')}</span>{o}</li>)}
              </ul>
            </section>
          )}

          {tiers.length > 0 && (
            <section className={s.block}>
              <h2 className={s.h2}>الباقات</h2>
              <div className={s.tiers}>
                {tiers.map((t, i) => (
                  <a key={t.id} href={`${enroll}?tier=${t.id}`} className={`reveal ${s.tier}`} data-highlight={t.highlight ? '1' : '0'} style={{ ['--d' as string]: i }}>
                    {t.highlight && <span className={s.flag}>الأكثر اختياراً</span>}
                    <strong>{t.name}</strong>
                    <span className={`num ${s.tierPrice}`}>{formatAmount(t.price)} <Riyal />{t.compareAt ? <s>{formatAmount(t.compareAt)}</s> : null}</span>
                    {t.description && <span className={s.muted}>{t.description}</span>}
                    {t.features.length > 0 && <ul role="list">{t.features.map((f) => <li key={f}>{f}</li>)}</ul>}
                    <span className={s.tierGo}>اختر هذه الباقة ←</span>
                  </a>
                ))}
              </div>
            </section>
          )}

          {cohorts.length > 0 && (
            <section className={s.block} aria-labelledby="cohorts-h">
              <h2 className={s.h2} id="cohorts-h">الدفعات</h2>
              <ul role="list" className={`stagger reveal ${s.cohorts}`}>
                {cohorts.map((k) => {
                  const left = k.seats ? k.seats.total - k.seats.taken : undefined
                  return (
                    <li key={k.id} className={s.cohort} data-state={k.state}>
                      <div>
                        <strong>{k.title}</strong>
                        <span className={`${s.muted} num`}>
                          {k.startsAt ? `${formatWeekday(k.startsAt)} ${formatDay(k.startsAt)}` : 'الموعد يُعلن قريباً'}{k.endsAt ? ` ← ${formatDay(k.endsAt)}` : ''}{k.city ? ` · ${k.city}` : ''}{k.venue ? ` — ${k.venue}` : ''}
                        </span>
                      </div>
                      <span className={`${s.cstate} num`} data-tone={k.state}>
                        {k.state === 'open' && left !== undefined ? `بقي ${left}` : COHORT_LABEL[k.state]}
                      </span>
                      {k.state === 'open' && <a className="btn ghost" href={`${enroll}?cohort=${k.id}`}>سجّل في هذه الدفعة</a>}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {data.blocks.length > 0 && <section className={s.block}><h2 className={s.h2}>عن الدورة</h2><Blocks blocks={data.blocks} media={data.blockMedia} /></section>}

          {curriculum.length > 0 && (
            <section className={s.block}>
              <h2 className={s.h2}>المنهج</h2>
              <p className={`${s.muted} num`}>{curriculum.length} وحدات · {lessons} درساً · {Math.round(minutes / 6) / 10} ساعة محتوى</p>
              <div className={s.curriculum}>
                {curriculum.map((m, i) => (
                  <details key={m.id} className={s.module} open={i === 0}>
                    <summary>
                      <span className={`${s.modNum} num`}>{i + 1}</span>
                      <strong>{m.title}</strong>
                      <span className={`${s.muted} num`}>{m.lessons.length} دروس</span>
                      <span className={s.chev} aria-hidden="true" />
                    </summary>
                    <ol role="list" className={s.lessons}>
                      {m.lessons.map((l) => (
                        <li key={l.id}>
                          <span className={s.ltype} data-type={l.type}>{LESSON[l.type]}</span>
                          <span className={s.ltitle}>{l.title}</span>
                          {(l.type === 'live' || l.type === 'onsite') && l.startsAt && cohorts.length === 0 && (
                            <span className={`${s.muted} num`}>{formatWeekday(l.startsAt)} {formatDay(l.startsAt)} · {formatTime(l.startsAt)}</span>
                          )}
                          {l.preview && <a className={s.free} href={`/learn/${c.slug}/${l.id}`}>معاينة مجانية ←</a>}
                          {l.minutes > 0 && <span className={`${s.muted} num`}>{l.minutes} د</span>}
                        </li>
                      ))}
                    </ol>
                  </details>
                ))}
              </div>
            </section>
          )}

          {(c.mode === 'onsite' || c.mode === 'blended') && (row.venue || c.city) && (
            <section className={s.block}>
              <h2 className={s.h2}>المكان</h2>
              <div className={s.venue}>
                <strong>{c.city}</strong>
                {row.venue && <Prose text={row.venue} />}
                {row.venueMapUrl && <a className="btn ghost" href={row.venueMapUrl} target="_blank" rel="noreferrer">الاتجاهات على الخريطة ↗</a>}
              </div>
            </section>
          )}

          {instructors.length > 0 && (
            <section className={s.block}>
              <h2 className={s.h2}>{instructors.length > 1 ? 'المدربون' : 'المدرب'}</h2>
              <div className={s.people}>
                {instructors.map((p) => (
                  <a key={p.slug} href={`/instructors/${p.slug}`} className={s.person}>
                    <span className={s.avatar}>{p.photo ? <Picture media={p.photo} /> : p.name.slice(0, 1)}</span>
                    <span><strong>{p.name}</strong><em>{p.title}</em>{p.bio && <small>{p.bio}</small>}</span>
                  </a>
                ))}
              </div>
            </section>
          )}

          {(row.audience.length > 0 || row.requirements.length > 0) && (
            <section className={`${s.block} ${s.two}`}>
              {row.audience.length > 0 && <div><h2 className={s.h2}>لمن هذه الدورة</h2><ul className={s.ticks}>{row.audience.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
              {row.requirements.length > 0 && <div><h2 className={s.h2}>المتطلبات</h2><ul className={s.ticks}>{row.requirements.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
            </section>
          )}

          {data.reviews.count > 0 && (
            <section className={s.block} aria-labelledby="reviews-h">
              <h2 className={s.h2} id="reviews-h">آراء المتدربين</h2>
              <div className={s.reviews}>
                <div className={s.score}>
                  <strong className="num">{data.reviews.avg.toFixed(1)}</strong>
                  <Stars value={data.reviews.avg} />
                  <span className="num">{data.reviews.count} تقييم</span>
                </div>
                <ol className={s.dist} role="list" aria-label="توزيع التقييمات">
                  {[5, 4, 3, 2, 1].map((n) => {
                    const k = data.reviews.dist[n - 1]
                    return <li key={n} className="num"><span>{n} ★</span><i><b style={{ transform: `scaleX(${data.reviews.count ? k / data.reviews.count : 0})` }} /></i><span>{k}</span></li>
                  })}
                </ol>
              </div>
              {data.reviews.items.length > 0 && (
                <ul className={s.quotes} role="list">
                  {data.reviews.items.map((r) => (
                    <li key={r.id}><Stars value={r.rating} /><p>{r.comment}</p><small>{r.display}</small></li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {row.faq.length > 0 && (
            <section className={s.block}>
              <h2 className={s.h2}>أسئلة شائعة</h2>
              <div className={s.faq}>
                {row.faq.map((f, i) => (
                  <details key={i}><summary>{f.q}<span className={s.chev} aria-hidden="true" /></summary><p>{f.a}</p></details>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className={s.aside} id="enroll">
          <div className={s.card} data-dim={st.dim ? '1' : '0'}>
            {st.dim && <span className={s.closedBadge}>{st.label}</span>}
            {fromPrice !== null ? <p className={`num ${s.from}`}><span>تبدأ من</span> {formatAmount(fromPrice)} <Riyal /></p> : <PriceTag pricing={c.pricing} size="l" />}
            {!isFree && vat > 0 && <p className={s.muted}>الأسعار شاملة ضريبة القيمة المضافة <span className="num">{vat}%</span></p>}
            {bestRule && firstRule && (
              <p className={s.muted}>
                {groupRules.length > 1
                  ? <>خصم المجموعات يبدأ من <span className="num">{firstRule.minQty}</span> مقاعد، ويبلغ <span className="num">{bestRule.percent}%</span> عند <span className="num">{bestRule.minQty}</span> فأكثر</>
                  : <>خصم <span className="num">{bestRule.percent}%</span> عند تسجيل <span className="num">{bestRule.minQty}</span> مقاعد فأكثر</>}
              </p>
            )}
            {c.seats && c.status !== 'closed' && (
              <div className={s.seats}>
                <div className={s.bar}><span style={{ ['--f' as string]: c.seats.taken / c.seats.total }} /></div>
                <span className="num">{left && left > 0 ? `بقي ${left} مقعداً من ${c.seats.total}` : 'اكتمل العدد'}</span>
              </div>
            )}
            <a href={enroll} className={`btn ${st.tone === 'open' ? '' : 'ghost'} ${s.cta}`}>{st.cta}</a>
            <ul role="list" className={s.includes}>
              <li>{modeLabel[c.mode]}{c.startsAt ? ` · ${formatDay(c.startsAt)}` : ''}</li>
              <li className="num">{c.hours} ساعة تدريبية</li>
              {mergeRules(row.certificate).enabled && <li>شهادة إتمام برمز تحقق</li>}
              {hasLive && <li>تسجيلات الجلسات للمسجّلين</li>}
            </ul>
            {st.tone === 'open' && !isFree && (
              <form method="get" className={s.couponForm}>
                <label><span>لديك كوبون؟</span><input name="coupon" dir="ltr" autoComplete="off" spellCheck={false} placeholder="CODE" /></label>
                <button className="btn ghost" type="submit">تطبيق</button>
              </form>
            )}
            {corporate && <a href="/#corporate" className={s.corp}>تسجيل فريق أو مؤسسة ←</a>}
          </div>
        </aside>
      </div>

      {related.length > 0 && (
        <section className={s.related}>
          <div className="wrap">
            <h2 className={s.h2}>من المسار نفسه</h2>
            <div className={`${s.relatedGrid} stagger reveal`}>
              {related.map((r) => <CourseCard key={r.slug} course={r} track={track} instructor={data.people.find((p) => p.slug === r.instructor)} />)}
            </div>
          </div>
        </section>
      )}

      <div className={s.mobileBar} data-dim={st.dim ? '1' : '0'}>
        {fromPrice !== null ? <span className={`num ${s.from}`} style={{ fontSize: 20 }}>من {formatAmount(fromPrice)} <Riyal /></span> : <PriceTag pricing={c.pricing} size="s" />}
        <a href={enroll} className="btn">{st.cta}</a>
      </div>
    </article>
  )
}
