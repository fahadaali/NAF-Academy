/* محتوى الرئيسية — يُخزَّن في settings['home'] ويُحرَّر من اللوحة. هذه القيم الافتراضية فقط. */
import type { LadderStep, Stat } from './types'

export const SCENES = ['ladder', 'tracks', 'courses', 'instructors', 'impact', 'corporate'] as const
export type SceneKey = (typeof SCENES)[number]

export const SCENE_LABEL: Record<SceneKey, string> = {
  ladder: 'سُلّم الكفاءة',
  tracks: 'رفّ المسارات',
  courses: 'الدورات القادمة',
  instructors: 'المدربون',
  impact: 'الأرقام',
  corporate: 'للمؤسسات',
}

export type SectionHead = { eyebrow: string; title: string }

export type HomeContent = {
  hero: { eyebrow: string; lines: string[]; phases: { at: number; text: string }[]; cta: { label: string; href: string } }
  ladder: { title: string; steps: LadderStep[] }
  stats: Stat[]
  corporate: { title: string; body: string; sizes: string[]; interests: string[] }
  sections: { key: SceneKey; visible: boolean }[]
  heads: Record<'ladder' | 'tracks' | 'courses' | 'instructors' | 'corporate', SectionHead>
  footer: { title: string; cta: string }
}

export const DEFAULT_HOME: Omit<HomeContent, 'hero' | 'ladder' | 'stats' | 'corporate'> = {
  sections: SCENES.map((key) => ({ key, visible: true })),
  heads: {
    ladder: { eyebrow: 'ثلاث درجات', title: '' },
    tracks: { eyebrow: 'ستة مسارات', title: 'اختر مس~3ارك، وابدأ من درجتك.' },
    courses: { eyebrow: 'الدورات القادمة', title: 'مقاعد مح~3دودة، ومواعيد قريبة.' },
    instructors: { eyebrow: 'المدربون', title: 'يعلّمك من مارس، لا من حف~3ظ.' },
    corporate: { eyebrow: 'للمؤسسات', title: '' },
  },
  footer: { title: 'الدرجة الأولى أقرب مما تظ~4ن.', cta: 'ابدأ الآن' },
}
