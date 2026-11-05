/* ناقل التمرير — مستمع سلبي واحد و rAF واحد لكل المنصة.
   مرحلتان في كل إطار: كل المشاهد تقرأ أولاً، ثم تكتب كلها —
   فلا يُجبَر المتصفح على إعادة حساب التخطيط بين قراءة وكتابة. */

export type Frame = { y: number; vh: number; vw: number; max: number; t: number }
export type Scene = { read?: (f: Frame) => void; write: (f: Frame) => void }

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
  scenes.forEach((s) => s.write(frame))
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

/** تقدّم عبور عنصر للشاشة: 0 حين يدخل من الأسفل، 1 حين يخرج من الأعلى */
export function passProgress(rect: DOMRect, vh: number): number {
  const p = (vh - rect.top) / (vh + rect.height)
  return p < 0 ? 0 : p > 1 ? 1 : p
}

export const current = () => frame
