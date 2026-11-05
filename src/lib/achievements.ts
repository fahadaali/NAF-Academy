/* الإنجازات — كتالوج ثابت (معنى كل شارة)، وقاعدة نقية تقرّر ما استحقه المتدرب من إحصاءاته.
   الكتالوج هنا لأنه منطق المنتج لا محتوى تسويقي؛ والإنجاز يُمنح مرة واحدة (فهرس فريد). */

export const ACHIEVEMENTS = {
  first_lesson: { title: 'الخطوة الأولى', body: 'أكملت أول درس — البداية أصعب ما في الطريق.', glyph: 'step' },
  halfway: { title: 'منتصف الطريق', body: 'بلغت نصف الدورة.', glyph: 'half' },
  course_complete: { title: 'أتممت الدورة', body: 'أكملت كل دروس الدورة.', glyph: 'done' },
  first_certificate: { title: 'شهادتك الأولى', body: 'صدرت أول شهادة لك من الأكاديمية.', glyph: 'seal' },
  attendee: { title: 'حاضر دائماً', body: 'حضرت ثلاث جلسات مباشرة أو حضورية.', glyph: 'seat' },
  quiz_ace: { title: 'إجابة كاملة', body: 'نلت الدرجة الكاملة في اختبار.', glyph: 'star' },
  three_courses: { title: 'متعلّم مثابر', body: 'أتممت ثلاث دورات.', glyph: 'stack' },
  track_complete: { title: 'أتممت مساراً', body: 'أكملت كل دورات مسار من مسارات الأكاديمية.', glyph: 'path' },
} as const
export type AchievementKind = keyof typeof ACHIEVEMENTS
/** إنجاز يتكرر لكل دورة أو مسار (ref) */
export const PER_REF: ReadonlySet<AchievementKind> = new Set(['halfway', 'course_complete', 'track_complete'])

export type LearnerStats = {
  lessonsDone: number
  /** نسبة الإنجاز لكل دورة مسجّل فيها */
  courses: { id: string; pct: number; trackId: string | null }[]
  certificates: number
  attended: number
  perfectQuiz: boolean
  /** دورات كل مسار (الظاهرة) — لإنجاز المسار */
  trackCourses: Map<string, string[]>
}

export function earned(x: LearnerStats): { kind: AchievementKind; ref: string }[] {
  const out: { kind: AchievementKind; ref: string }[] = []
  if (x.lessonsDone >= 1) out.push({ kind: 'first_lesson', ref: '' })
  for (const c of x.courses) {
    if (c.pct >= 50) out.push({ kind: 'halfway', ref: c.id })
    if (c.pct >= 100) out.push({ kind: 'course_complete', ref: c.id })
  }
  if (x.certificates >= 1) out.push({ kind: 'first_certificate', ref: '' })
  if (x.attended >= 3) out.push({ kind: 'attendee', ref: '' })
  if (x.perfectQuiz) out.push({ kind: 'quiz_ace', ref: '' })
  const done = new Set(x.courses.filter((c) => c.pct >= 100).map((c) => c.id))
  if (done.size >= 3) out.push({ kind: 'three_courses', ref: '' })
  for (const [track, ids] of x.trackCourses) if (ids.length >= 2 && ids.every((id) => done.has(id))) out.push({ kind: 'track_complete', ref: track })
  return out
}
