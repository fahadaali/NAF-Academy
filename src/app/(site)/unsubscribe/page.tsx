import type { Metadata } from 'next'
import { isOptedOut, readOptout } from '@/server/notify/optout'
import { UnsubscribeForm } from '@/site/Unsubscribe'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'تفضيلات الرسائل', robots: { index: false } }

const mask = (e: string) => e.replace(/^(.{2}).*(@.*)$/, '$1•••$2')

export default async function Unsubscribe({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const t = (await searchParams).t ?? ''
  const email = readOptout(t)
  return (
    <div className="wrap" style={{ paddingBlock: 'calc(var(--header-h) + 64px) 120px', maxInlineSize: 640, display: 'grid', gap: 18 }}>
      <span className="eyebrow">تفضيلات الرسائل</span>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(30px, 4vw, 44px)', fontWeight: 900 }}>رسائل أكاديمية ناف</h1>
      {email ? (
        <>
          <p className="num" dir="ltr" style={{ justifySelf: 'end', color: 'var(--muted)' }}>{mask(email)}</p>
          <UnsubscribeForm token={t} initial={await isOptedOut(email)} />
        </>
      ) : <p>الرابط غير صالح. استخدم الرابط الموجود أسفل الرسالة، أو غيّر التفضيل من ملفك في مساحة التعلّم.</p>}
    </div>
  )
}
