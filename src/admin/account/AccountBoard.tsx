'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge, Field, Grid, Input, PageHead, Section } from '@/admin/ui/kit'
import { changePassword, confirmTotpAction, disableTotpAction, startTotp } from './actions'
import p from '@/admin/ui/panel.module.css'
import st from './account.module.css'

type Msg = { ok: boolean; text: string } | null

export function AccountBoard({ name, email, role, totp, passwordSetAt }: { name: string; email: string; role: string; totp: boolean; passwordSetAt: string | null }) {
  const router = useRouter()
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [pwMsg, setPwMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState(false)
  const [enroll, setEnroll] = useState<{ secret: string; qr: string } | null>(null)
  const [code, setCode] = useState('')
  const [offPw, setOffPw] = useState('')
  const [tMsg, setTMsg] = useState<Msg>(null)

  return (
    <>
      <PageHead title="حسابي" sub={`${name} · ${role}`} />
      <Section title="البريد" desc="بريد الدخول إلى اللوحة — يغيّره مالك المنصة من «الفريق» إن لزم">
        <p className={p.ltr}>{email}</p>
      </Section>

      <Section title="كلمة المرور" desc={passwordSetAt ? `آخر تعيين: ${passwordSetAt}. تغييرها يُخرج حسابك من كل الأجهزة الأخرى.` : 'تغييرها يُخرج حسابك من كل الأجهزة الأخرى.'}>
        <form className={st.form} onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setPwMsg(null)
          const r = await changePassword(pw)
          setBusy(false)
          setPwMsg(r.ok ? { ok: true, text: 'حُفظت كلمة المرور الجديدة' } : { ok: false, text: r.error ?? 'تعذّر الحفظ' })
          if (r.ok) setPw({ current: '', next: '', confirm: '' })
        }}>
          <Grid cols={3}>
            <Field label="الحالية"><Input type="password" autoComplete="current-password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
            <Field label="الجديدة" hint="10 أحرف على الأقل"><Input type="password" autoComplete="new-password" required minLength={10} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
            <Field label="تأكيدها"><Input type="password" autoComplete="new-password" required minLength={10} value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
          </Grid>
          <div className={st.row}>
            <button className="btn" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'تغيير كلمة المرور'}</button>
            {pwMsg && <span role={pwMsg.ok ? 'status' : 'alert'} className={pwMsg.ok ? st.ok : st.err}>{pwMsg.text}</span>}
          </div>
        </form>
      </Section>

      <Section title="التحقق الثنائي" desc="رمز من تطبيق مصادقة (Google Authenticator أو Microsoft Authenticator أو Authy) بعد كلمة المرور — يحمي الحساب لو تسرّبت كلمة المرور."
        aside={totp ? <Badge tone="open">مفعّل</Badge> : <Badge tone="draft">غير مفعّل</Badge>}>
        {totp ? (
          <form className={st.form} onSubmit={async (e) => {
            e.preventDefault(); setTMsg(null)
            const r = await disableTotpAction(offPw)
            setTMsg(r.ok ? { ok: true, text: 'أُلغي التحقق الثنائي' } : { ok: false, text: r.error ?? 'تعذّر' })
            if (r.ok) { setOffPw(''); router.refresh() }
          }}>
            <Field label="لإلغائه: كلمة المرور"><Input type="password" autoComplete="current-password" required value={offPw} onChange={(e) => setOffPw(e.target.value)} /></Field>
            <div className={st.row}>
              <button className="btn ghost">إلغاء التحقق الثنائي</button>
              {tMsg && <span role={tMsg.ok ? 'status' : 'alert'} className={tMsg.ok ? st.ok : st.err}>{tMsg.text}</span>}
            </div>
          </form>
        ) : enroll ? (
          <form className={st.form} onSubmit={async (e) => {
            e.preventDefault(); setTMsg(null)
            const r = await confirmTotpAction(code)
            if (r.ok) { setEnroll(null); setCode(''); setTMsg({ ok: true, text: 'فُعّل التحقق الثنائي — سيُطلب الرمز في كل دخول' }); router.refresh() }
            else setTMsg({ ok: false, text: r.error ?? 'تعذّر' })
          }}>
            <ol className={st.steps}>
              <li>افتح تطبيق المصادقة ← إضافة حساب ← امسح الرمز.</li>
              <li>أو أدخل المفتاح يدوياً: <code className={`${p.ltr} ${st.secret}`}>{enroll.secret.replace(/(.{4})/g, '$1 ').trim()}</code></li>
              <li>أدخل الرمز ذا الأرقام الستة الذي يظهر في التطبيق.</li>
            </ol>
            <div className={st.qr} aria-label="رمز QR لإضافة الحساب" role="img" dangerouslySetInnerHTML={{ __html: enroll.qr }} />
            <Field label="الرمز من التطبيق"><Input inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={7} required value={code} onChange={(e) => setCode(e.target.value)} /></Field>
            <div className={st.row}>
              <button className="btn">تفعيل</button>
              <button type="button" className="btn ghost" onClick={() => { setEnroll(null); setTMsg(null) }}>إلغاء</button>
              {tMsg && <span role={tMsg.ok ? 'status' : 'alert'} className={tMsg.ok ? st.ok : st.err}>{tMsg.text}</span>}
            </div>
          </form>
        ) : (
          <div className={st.row}>
            <button className="btn" onClick={async () => {
              setTMsg(null)
              const r = await startTotp()
              if (r.ok && r.secret && r.qr) setEnroll({ secret: r.secret, qr: r.qr })
              else setTMsg({ ok: false, text: r.error ?? 'تعذّر' })
            }}>تفعيل التحقق الثنائي</button>
            {tMsg && <span role={tMsg.ok ? 'status' : 'alert'} className={tMsg.ok ? st.ok : st.err}>{tMsg.text}</span>}
          </div>
        )}
      </Section>
    </>
  )
}
