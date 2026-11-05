/* إشعارات المنصة — كل رسالة تخص المتدرب (التسجيل، الجلسات، الدروس الجديدة، الشهادة، الإنجازات) ولو لم يُربط البريد. */
import { currentLearner } from '@/server/learner-auth'
import { inboxOf } from '@/server/achievements'
import { formatDay, formatTime } from '@/lib/dates'
import { MarkRead } from '@/site/learn/MarkRead'
import st from '@/site/learn/learn.module.css'

export default async function Inbox() {
  const me = (await currentLearner())!
  const { rows, unread } = await inboxOf(me.id, 100)
  if (!rows.length) return <div className={st.empty}><strong>لا إشعارات بعد.</strong><span>تصلك هنا مواعيد الجلسات والدروس الجديدة والشهادات والإنجازات.</span></div>
  return (
    <section className={st.inbox} aria-labelledby="inbox-h">
      <div className={st.inboxHead}>
        <h2 id="inbox-h">الإشعارات</h2>
        {unread > 0 && <MarkRead />}
      </div>
      <ol role="list" className="stagger reveal">
        {rows.map((n) => (
          <li key={n.id} data-unread={n.readAt ? '0' : '1'}>
            <a href={n.url || '/learn'} className={st.note}>
              <strong>{n.title}</strong>
              {n.body && <span>{n.body}</span>}
              <small className="num">{formatDay(n.createdAt)} · {formatTime(n.createdAt)}</small>
            </a>
          </li>
        ))}
      </ol>
    </section>
  )
}
