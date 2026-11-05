/* محتوى الرئيسية — يُخزَّن في settings['home'] ويُحرَّر من اللوحة. هذه القيم الافتراضية فقط. */
import type { LadderStep, Stat } from './types'

export const SCENES = ['ladder', 'tracks', 'courses', 'instructors', 'impact', 'voices', 'partners', 'faq', 'corporate'] as const
export type SceneKey = (typeof SCENES)[number]

export const SCENE_LABEL: Record<SceneKey, string> = {
  ladder: 'سُلّم الكفاءة',
  tracks: 'رفّ المسارات',
  courses: 'الدورات القادمة',
  instructors: 'المدربون',
  impact: 'الأرقام',
  voices: 'آراء المتدربين',
  partners: 'الجهات الشريكة',
  faq: 'الأسئلة الشائعة',
  corporate: 'للمؤسسات',
}

/* اسم كل مشهد في قائمة الشريط — يُحرَّر من اللوحة؛ الفارغ لا يظهر في القائمة */
export const DEFAULT_MENU: Record<SceneKey, string> = {
  ladder: 'سُلّم الكفاءة',
  tracks: 'المسارات',
  courses: 'الدورات',
  instructors: 'المدربون',
  impact: '',
  voices: '',
  partners: '',
  faq: '',
  corporate: 'للمؤسسات',
}

export type SectionHead = { eyebrow: string; title: string }
export type Voice = { quote: string; name: string; role: string; photoId: string | null }
export type Partner = { name: string; logoId: string | null; url: string }

export type HomeContent = {
  hero: { eyebrow: string; lines: string[]; phases: { at: number; text: string }[]; cta: { label: string; href: string } }
  ladder: { title: string; steps: LadderStep[] }
  stats: Stat[]
  corporate: { title: string; body: string; sizes: string[]; interests: string[] }
  sections: { key: SceneKey; visible: boolean; menu?: string }[]
  heads: Record<'ladder' | 'tracks' | 'courses' | 'instructors' | 'corporate' | 'voices' | 'partners' | 'faq', SectionHead>
  /** آراء حقيقية يضيفها الفريق — لا آراء افتراضية؛ المشهد يغيب ما دامت فارغة */
  voices: Voice[]
  /** شعارات الجهات الشريكة أو العملاء — تغيب ما دامت فارغة */
  partners: Partner[]
  /** أسئلة عامة عن الأكاديمية (تُعلَن لمحركات البحث FAQPage) — تغيب ما دامت فارغة */
  faq: { q: string; a: string }[]
  footer: { title: string; cta: string }
}

export const DEFAULT_HOME: Omit<HomeContent, 'hero' | 'ladder' | 'stats' | 'corporate'> = {
  sections: SCENES.map((key) => ({ key, visible: true, menu: DEFAULT_MENU[key] })),
  voices: [],
  partners: [],
  faq: [],
  heads: {
    ladder: { eyebrow: 'ثلاث درجات', title: '' },
    tracks: { eyebrow: 'ستة مسارات', title: 'اختر مس~3ارك، وابدأ من درجتك.' },
    courses: { eyebrow: 'الدورات القادمة', title: 'مقاعد مح~3دودة، ومواعيد قريبة.' },
    instructors: { eyebrow: 'المدربون', title: 'يعلّمك من مارس، لا من حف~3ظ.' },
    corporate: { eyebrow: 'للمؤسسات', title: '' },
    voices: { eyebrow: 'من متدربينا', title: 'تجارب من مار~3سوا.' },
    partners: { eyebrow: 'جهات تثق بالأكاديمية', title: '' },
    faq: { eyebrow: 'أسئلة شائعة', title: 'قبل أن تسج~3ّل.' },
  },
  footer: { title: 'الدرجة الأولى أقرب مما تظ~4ن.', cta: 'ابدأ الآن' },
}

/** قائمة الشريط من مشاهد الرئيسية نفسها: الظاهر منها وبترتيبه — فلا رابط إلى مشهد أُخفي */
export function menuOf(h: Pick<HomeContent, 'sections'>): { href: string; label: string }[] {
  return h.sections.filter((x) => x.visible && x.menu?.trim()).map((x) => ({ href: `/#${x.key}`, label: x.menu!.trim() }))
}
