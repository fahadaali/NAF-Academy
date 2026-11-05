/* أنواع محتوى الدرس — مشتركة بين الخادم والمحرّر والمتصفح. إجابات الاختبار لا تخرج للمتصفح أبداً. */

export type VideoSource =
  | { provider: 'stream'; uid: string }
  | { provider: 'url'; url: string }
  | { provider: 'none' }

export type Chapter = { at: number; title: string }
export type Attachment = { assetId: string; name: string; size: number }

export type QuizQuestion = {
  id: string
  kind: 'single' | 'multi' | 'truefalse' | 'case'
  prompt: string
  /** نص الحالة العملية لسؤال «case» */
  caseText?: string
  options: { id: string; text: string }[]
  correct: string[]
  explanation?: string
  points?: number
}

export type Quiz = {
  passPct: number
  attempts: number | null
  timeLimitMin: number | null
  shuffle: boolean
  showAnswers: boolean
  questions: QuizQuestion[]
}

/** ما يصل المتصفح قبل التسليم — بلا correct ولا explanation */
export type PublicQuiz = Omit<Quiz, 'questions'> & { questions: Omit<QuizQuestion, 'correct' | 'explanation'>[] }

export type Assignment = { instructions: string; maxSizeMb: number; accept: string[]; dueDays: number | null }

export type Drip = { mode: 'none' | 'date' | 'days'; date: string | null; days: number | null }

export const EMPTY_QUIZ: Quiz = { passPct: 70, attempts: 3, timeLimitMin: null, shuffle: true, showAnswers: true, questions: [] }
export const EMPTY_ASSIGNMENT: Assignment = { instructions: '', maxSizeMb: 10, accept: ['pdf', 'docx'], dueDays: null }
