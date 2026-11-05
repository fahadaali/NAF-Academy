'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ChannelSettings, ChannelState } from '@/server/notify/channels'
import { saveChannels } from './actions'
import { PageHead, Section, Switch } from '@/admin/ui/kit'
import s from '@/admin/sales/sales.module.css'

const LABEL = { resend: 'Resend', taqnyat: 'تقنيات', webpush: 'Web Push (VAPID)', outbox: 'صندوق تجريبي (تطوير)' } as const

export function ChannelsForm({ initial, email, sms, push }: { initial: ChannelSettings; email: ChannelState; sms: ChannelState; push: ChannelState }) {
  const router = useRouter()
  const [v, setV] = useState(initial)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const card = (title: string, st: ChannelState, on: boolean, set: (b: boolean) => void, steps: string[]) => (
    <>
      <div className={s.gateway} data-state={st.configured ? (on ? 'on' : 'ready') : 'off'}>
        <div>
          <span className={s.dot} aria-hidden="true" />
          <strong>{title}: {st.provider ? LABEL[st.provider] : 'غير مربوط'}</strong>
          <p>{st.configured ? (on ? (title === 'إشعارات المتصفح' ? 'مفعّل — تصل التذكيرات لمن فعّل التنبيهات.' : 'مفعّل — يستقبل المتدربون رموز الدخول والتذكيرات عبره.') : 'جاهز — فعّله ليظهر خيار الدخول.') : st.problem}</p>
          {st.provider === 'outbox' && <p className={s.warn}>⚠︎ لا يُرسل فعلياً — الرسائل تظهر في «سجل الرسائل» للاختبار.</p>}
        </div>
        <Switch checked={on} onChange={set} label={on ? 'مفعّل' : 'مقفل'} />
      </div>
      {!st.configured && <Section title={`ربط ${title}`}><ol className={s.stepsList}>{steps.map((x) => <li key={x}>{x}</li>)}</ol></Section>}
    </>
  )
  return (
    <>
      <PageHead title="قنوات الرسائل" sub="رموز الدخول، والتذكيرات، وتأكيد الطلبات والفواتير — كل قناة مقفلة حتى تُربط" />
      {card('البريد', email, v.emailEnabled, (b) => setV({ ...v, emailEnabled: b }), ['أنشئ حساباً في Resend ووثّق نطاق المرسل (مثل academy.naf.sa).', 'أضف في البيئة: RESEND_API_KEY و MAIL_FROM (مثل: أكاديمية ناف <no-reply@academy.naf.sa>).', 'أعد النشر ثم فعّل هنا.'])}
      {card('الجوال', sms, v.smsEnabled, (b) => setV({ ...v, smsEnabled: b }), ['من لوحة تقنيات: أنشئ مفتاح API واعتمد اسم المرسل.', 'أضف في البيئة: TAQNYAT_API_KEY و SMS_SENDER.', 'أعد النشر ثم فعّل هنا.'])}
      {card('إشعارات المتصفح', push, v.pushEnabled, (b) => setV({ ...v, pushEnabled: b }), ['ولّد زوج مفاتيح VAPID مرة واحدة: node scripts/vapid.mjs', 'أضف في البيئة: VAPID_PUBLIC_KEY و VAPID_PRIVATE_KEY (سرّ) و VAPID_SUBJECT (مثل mailto:academy@naf.sa).', 'أعد النشر ثم فعّل هنا — يظهر للمتدرب زر «فعّل التنبيهات» في ملفه.'])}
      {msg && <p role="status" style={{ fontWeight: 600, color: msg.ok ? 'var(--success)' : 'var(--danger)', marginBlockEnd: 12 }}>{msg.t}</p>}
      <button className="btn" onClick={async () => {
        const r = await saveChannels(v)
        if (r.ok) { setMsg({ ok: true, t: 'حُفظت' }); router.refresh() } else setMsg({ ok: false, t: r.error ?? 'تعذّر' })
      }}>حفظ</button>
    </>
  )
}
