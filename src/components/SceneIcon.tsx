/* أيقونات أقسام الرئيسية في الشريط — عائلة واحدة بلغة شعار الأكاديمية: خط رفيع واحد بأطراف مدوّرة على شبكة 24×24
   بلون currentColor، ومعيّن الكتاب الصغير لمسةً مشتركة (بلون --ico-mark). تُربط بمفتاح المشهد لا بترتيبه،
   فتبقى صحيحة إن أُعيد ترتيب الأقسام أو أُخفي بعضها. زخرفية: العنوان يبقى النص المقروء. */
import type { ReactNode } from 'react'
import type { SceneKey } from '@/content/home-defaults'

/** معيّن صغير بمركز (x, y) ونصف قطر r — لمسة الشعار في كل أيقونة */
const gem = (x: number, y: number, r = 1.9) => <path d={`M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`} className="ico-mark" />

export const SCENE_ICONS: Record<SceneKey, ReactNode> = {
  /* سُلّم الكفاءة: درجات صاعدة من اليمين إلى اليسار (اتجاه القراءة، كمشهد السُّلّم) وفي أعلاها المعيّن */
  ladder: <><path d="M20 20h-4.5v-4.5H11V11H6.5V6.5" />{gem(4.5, 4.2)}</>,
  /* المسارات: طريق متعرّج يبدأ يميناً وينتهي يساراً */
  tracks: <><circle cx="18.5" cy="18.5" r="1.8" /><path d="M16.7 18.5H10a3 3 0 0 1 0-6h4a3 3 0 0 0 0-6H8.5" />{gem(5.6, 6.5)}</>,
  /* الدورات: الكتاب المفتوح نفسه */
  courses: <><path d="M12 19.5c-2.2-3-5-4.6-8.5-5.1V7.2c3.5.5 6.3 2.1 8.5 5.1 2.2-3 5-4.6 8.5-5.1v7.2c-3.5.5-6.3 2.1-8.5 5.1Z" /><path d="M12 12.3v7.2" />{gem(12, 4.6)}</>,
  /* المدربون: رأس وكتفان، والمعيّن على الصدر */
  instructors: <><circle cx="12" cy="7.5" r="3.3" /><path d="M5 20.5c.6-4 3.4-6.3 7-6.3s6.4 2.3 7 6.3" />{gem(12, 17.6, 1.5)}</>,
  /* الأثر: أعمدة صاعدة */
  impact: <><path d="M4 20h16" /><path d="M7 20v-5M12 20v-8.5M17 20v-4" />{gem(17, 7.5)}</>,
  /* الآراء: فقاعة قول */
  voices: <><path d="M5.5 5.5h13a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H11l-4 3.5v-3.5H5.5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" />{gem(12, 11)}</>,
  /* الشركاء: حلقتان متشابكتان */
  partners: <><circle cx="9" cy="13" r="4.8" /><circle cx="15" cy="13" r="4.8" />{gem(12, 4.4)}</>,
  /* الأسئلة: علامة استفهام في دائرة */
  faq: <><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.5" />{gem(12, 16.8, 1.4)}</>,
  /* للمؤسسات: مبنى بنوافذ */
  corporate: <><path d="M5 20.5V6.5l7-3 7 3v14" /><path d="M3.5 20.5h17" /><path d="M9 10h1.5M13.5 10H15M9 14h1.5M13.5 14H15" />{gem(12, 18, 1.4)}</>,
}

export function SceneIcon({ name, className = '' }: { name: string; className?: string }) {
  const art = (SCENE_ICONS as Record<string, ReactNode>)[name] ?? gem(12, 12, 3)
  return (
    <svg viewBox="0 0 24 24" className={`scene-ico ${className}`} aria-hidden="true" focusable="false"
      fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      {art}
    </svg>
  )
}
