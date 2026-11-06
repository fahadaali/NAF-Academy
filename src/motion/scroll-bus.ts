/* ناقل التمرير — مستمع سلبي واحد و rAF واحد لكل المنصة.
   مرحلتان في كل إطار: كل المشاهد تقرأ أولاً، ثم تكتب كلها —
   فلا يُجبَر المتصفح على إعادة حساب التخطيط بين قراءة وكتابة.
   مشهد يعيد `true` من write يطلب إطاراً تالياً (متابِع لم يبلغ هدفه بعد) — التمرير نفسه أصلي دائماً. */
import { prefersCalm, timing } from './tokens'

export type Frame = { y: number; vh: number; vw: number; max: number; t: number }
export type Scene = { read?: (f: Frame) => void; write: (f: Frame) => void | boolean }

const scenes = new Set<Scene>()
let queued = false
let frame: Frame = { y: 0, vh: 0, vw: 0, max: 1, t: 0 }

const measure = (t: number): Frame => {
  const doc = document.documentElement
  return {
    y: window.scrollY,
    vh: window.innerHeight,
    vw: doc.clientWidth,
    max: Math.max(1, doc.scrollHeight - window.innerHeight),
    t,
  }
}

const run = (t: number) => {
  queued = false
  frame = measure(t)
  scenes.forEach((s) => s.read?.(frame))
  let more = false
  scenes.forEach((s) => { if (s.write(frame) === true) more = true })
  if (more) request()
}

export const request = () => {
  if (!queued) {
    queued = true
    requestAnimationFrame(run)
  }
}

export function subscribe(scene: Scene): () => void {
  if (!scenes.size) {
    addEventListener('scroll', request, { passive: true })
    addEventListener('resize', request, { passive: true })
  }
  scenes.add(scene)
  request()
  return () => {
    scenes.delete(scene)
    if (!scenes.size) {
      removeEventListener('scroll', request)
      removeEventListener('resize', request)
    }
  }
}

/** تقدّم مشهد مثبّت: 0 عند وصول أعلاه لأعلى الشاشة، 1 عند وصول أسفله لأسفلها */
export function pinProgress(rect: DOMRect, vh: number): number {
  const total = rect.height - vh
  if (total <= 0) return rect.top <= 0 ? 1 : 0
  const p = -rect.top / total
  return p < 0 ? 0 : p > 1 ? 1 : p
}

/** متابِع ناعم لقيمة مشتقة من التمرير: يقترب من هدفه أسّياً بزمن الإطار الفعلي (مستقل عن معدّل تحديث الشاشة).
    عجلة الفأرة تقفز درجات؛ في مشهد مثبّت لا يتحرك فيه شيء غير هذه القيمة، فيظهر القفز تقطّعاً — المتابِع يصله.
    `to()` تعيد true ما دام يتحرك (تُعاد من write ليطلب الناقل إطاراً آخر). مع تقليل الحركة يلتصق بالهدف. */
export function follower(tau: number = timing.follow) {
  let v = Number.NaN
  let last = 0
  return {
    to(target: number, t: number): boolean {
      if (Number.isNaN(v) || prefersCalm()) {
        v = target
        last = t
        return false
      }
      /* بعد سكون (لا إطارات متتالية) نعدّ المنقضي إطاراً واحداً، فلا يقفز أول إطار بعد التوقف */
      const raw = Math.max(0, t - last)
      const dt = raw > 100 ? 1000 / 60 : raw
      last = t
      v += (target - v) * (1 - Math.exp(-dt / tau))
      if (Math.abs(target - v) < 1e-4) {
        v = target
        return false
      }
      return true
    },
    get value() {
      return v
    },
  }
}
