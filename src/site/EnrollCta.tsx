'use client'
/* زرّ التسجيل في صفحة الدورة العامة: يُرسم «سجّل» من الخادم (الصفحة مخزّنة للجميع وتعمل بلا JS)،
   ثم للداخل وحده (كوكي naf_hi) يُسأل الخادم عن حاله في الدورة فيصير «ادخل إلى الدورة» أو «أكمل بياناتك لتبدأ» —
   فلا يُطلب من المسجّل التسجيل ثانية. طلب واحد للصفحة ولو تعدّدت الأزرار. */
import { useEffect, useState } from 'react'
import type { MyCourseState } from '@/app/api/me/course/route'

const asked = new Map<string, Promise<MyCourseState>>()
function stateOf(slug: string) {
  let p = asked.get(slug)
  if (!p) {
    p = fetch(`/api/me/course?slug=${encodeURIComponent(slug)}`, { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { state: 'none' })).then((j: { state?: MyCourseState }) => j.state ?? 'none').catch(() => 'none' as const)
    asked.set(slug, p)
  }
  return p
}

export function EnrollCta({ slug, href, label, className }: { slug: string; href: string; label: string; className?: string }) {
  const [state, setState] = useState<MyCourseState>('none')
  useEffect(() => {
    if (!/(?:^|; )naf_hi=/.test(document.cookie)) return
    let live = true
    void stateOf(slug).then((x) => { if (live) setState(x) })
    return () => { live = false }
  }, [slug])
  const view = state === 'enrolled' ? { href: `/learn/${slug}`, label: 'ادخل إلى الدورة' }
    : state === 'profile' ? { href: `/learn/profile?next=${encodeURIComponent(`/learn/${slug}`)}`, label: 'أكمل بياناتك لتبدأ' }
    : state === 'expired' ? { href, label: 'جدّد الوصول' }
    : { href, label }
  return <a href={view.href} className={className}>{view.label}</a>
}
