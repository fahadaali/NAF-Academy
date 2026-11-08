/* رموز الحركة — كل مدة ومنحنى في المنصة مشتقّ من هنا.
   ثلاث مدد أساسية، وكل توقيت آخر مركّب منها، فيبقى الإيقاع واحداً. */

export const duration = { fast: 140, base: 220, gentle: 320 } as const
const d = duration

type Curve = readonly [number, number, number, number]
const curve = {
  in: [0.2, 0.85, 0.25, 1],
  move: [0.4, 0, 0.2, 1],
  out: [0.4, 0, 1, 1],
  glide: [0.22, 0.82, 0.2, 1],
  travel: [0.65, 0, 0.25, 1],
} as const satisfies Record<string, Curve>
/* في CSS وحده: --ease-steady (linear) للدوران المستمر، و--ease-blink (steps(2)) لوميض العدّاد المتقطّع */

/* توقيتات مركّبة */
export const timing = {
  hover: d.fast,
  reveal: d.gentle * 2 + d.fast, // 780
  wordStagger: d.fast / 2.8, // ~50 لكل كلمة
  count: d.gentle * 5, // 1600 للعدّادات
  curtain: d.gentle * 4, // 1280 رفع الستار
  curtainMax: d.gentle * 15, // سقف احتياطي
  flip: d.gentle * 2, // تقليب المجلدات
  themeSweep: d.gentle * 2 + d.base, // 860 دائرة تبديل الوضع
  notice: d.gentle * 6, // 1920 رسالة مؤقتة («نُسخ الرابط»)
  /* ثابت زمن متابعة التمرير: القيم المربوطة بالتمرير تنساب نحو هدفها (نحو 95% في ثلاثة أمثاله ≈ 250ms)،
     فلا تقفز مع درجات عجلة الفأرة في المشاهد المثبّتة */
  follow: d.fast * 0.6, // 84
  /* سؤال Stream عن حالة المعالجة في اللوحة، وانتظار إعادة محاولة جزء tus (يُضرب في رقم المحاولة) */
  streamPoll: d.gentle * 16, // ~5s
  uploadRetry: d.gentle * 6, // ~2s × المحاولة
} as const

/* خطوات التتابع (بين عنصر وتاليه) — مرآتها في tokens.css: --stagger-* (مشتقة من --t-fast) */
export const stagger = {
  fine: d.fast / 8, // ~18 أعمدة الرسوم الكثيفة
  row: d.fast / 3, // ~47 صفوف الجداول والقوائم
  word: d.fast / 2.8, // ~50 الكلمات
  item: d.fast / 2, // 70 البطاقات والعناصر
  step: d.fast * 0.64, // ~90 درجات المشاهد
} as const

/* حلقات محيطة بطيئة (نبض، تنفّس، انجراف، دوران) — زخرفة لا تحمل معنى، وتتوقف مع تقليل الحركة.
   مرآتها في tokens.css: --t-blink و--t-pulse و--t-breathe و--t-drift و--t-orbit */
export const loop = {
  blink: d.gentle * 3, // 960
  pulse: d.gentle * 5, // 1600
  breathe: d.gentle * 8, // 2560
  drift: d.gentle * 75, // 24000
  orbit: d.gentle * 94, // 30080
} as const

/* ── bezier محسوب يدوياً للمشاهد المربوطة بالتمرير (نيوتن-رافسون) ── */
function bezier([x1, y1, x2, y2]: Curve): (t: number) => number {
  const sample = (a1: number, a2: number, t: number) =>
    ((1 - 3 * a2 + 3 * a1) * t + (3 * a2 - 6 * a1)) * t * t + 3 * a1 * t
  const slope = (a1: number, a2: number, t: number) =>
    3 * (1 - 3 * a2 + 3 * a1) * t * t + 2 * (3 * a2 - 6 * a1) * t + 3 * a1
  return (x) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let t = x
    for (let i = 0; i < 8; i++) {
      const err = sample(x1, x2, t) - x
      const s = slope(x1, x2, t)
      if (Math.abs(err) < 1e-5 || !s) break
      t -= err / s
    }
    return sample(y1, y2, Math.min(1, Math.max(0, t)))
  }
}

export const ease = {
  in: bezier(curve.in),
  move: bezier(curve.move),
  glide: bezier(curve.glide),
  travel: bezier(curve.travel),
}

/* أدوات المشاهد */
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
export const smooth = (t: number) => t * t * (3 - 2 * t)

export const prefersCalm = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
